import * as vscode from 'vscode';
import * as path from 'path';
import { FigmaFile, ComponentsMeta } from './figmafile';
import { LinksMap, LayerSelectorLink } from './link';
import { CssProperties } from './stylesheet';
import { Parser } from './figmanodeparser';

const internalLayerPrefix = '_';

/**
 * Represents a Figma layer
 */
export class FigmaLayer {

    node: any;
    parent: FigmaLayer | undefined;
    _styles: CssProperties = {};

    constructor(node: any, parent?: FigmaLayer) {
        this.node = node;
        this.parent = parent;
        this._styles = new Parser(node).parse();
    }

    get id(): string {
        return this.node.id;
    }

    get children(): FigmaLayer[] {
        if(!this.node.children){
            return [];
        }
        return this.node.children.map((c: FigmaLayer) => new FigmaLayer(c, this));
    }
    
    get name(): string {
        return this.node.name;
    }

    get type(): string {
        return this.node.type;
    }

    get styles(): CssProperties {
        if(Object.entries(this._styles).length !== 0){
            // Object has its own styles. Return them.
            return this._styles;
        }
        
        // Object doesn't have its own styles. Allow it to use its children styles IFF there are no conflicts between them
        let children = this.getPrunedChildren();
        let styles: CssProperties = {};
        // For each children, check their styles for conflicts
        for(let i = 0; i < children.length; i++){
            let child = children[i];
            let childStyles = child.styles;
            // Check each prop in this child's styles
            for(let childProp in childStyles){
                if(childProp in styles && childStyles[childProp] !== styles[childProp]){
                    // Found a conflict. Return no styles.
                    return {};
                } else {
                    // No conflict. Add property.
                    styles[childProp] = childStyles[childProp];
                }
            }
        }
        return styles;
    }

    /**
     * Returns all children, replacing its unecessary children with non-unecessary descendents (see isUnecessary getter description)
     */
    getPrunedChildren(): FigmaLayer[] {
        let children = this.children;
        let initialLength = children.length;

        // Check if node has children
        if(initialLength > 0){
            let i = initialLength - 1;
            while(i >= 0){
                let child = children[i];
                // Check if this child is unecessary and needs to be replaced
                if(child.isUnecessaryLayer){
                    // This child is unecessary. Replace it with non unecessary descendents.
                    let grandChildren = child.getPrunedChildren(); 
                    children.splice(i, 1, ...grandChildren);
                    // Move index to end of children to prune the newly added descendents as well
                    i = i + grandChildren.length - 1;
                } else {
                    // The child is not unecessary Decrease counter
                    i--;
                }
            }
        }
        return children;
    }

    /**
     * Returns the first non-unecessary parent of a layer
     */
    getPrunedParent(): FigmaLayer | undefined {
        if(this.parent){
            // There is a parent. Check if it's unecessary
            if(this.parent.isUnecessaryLayer){
                // It's unecessary. Look at its parent.
                return this.parent.getPrunedParent();
            } else {
                // Found non unecessary parent
                return this.parent;
            }
        }
        // No parent to return
        return undefined;
    }

    /**
     * Returns an array of strings with the path between the root until the current node (inclusive).
     * The root node will be the first item in the array, and the current item will be the last.
     */
    get path(): string[] {
        let parent = this.getPrunedParent();
        if(parent === undefined){
            // If this is the root, return only its own label
            return [this.name];
        } else {
            // Otherwise, return this label preceded by the parent's path
            return [...parent.path, this.name];
        }
    }

    /**
     * returns the number of siblings this node has. Returns 0 if layer has no parent.
     */
    get siblingCount(): number {
        if(this.parent){
            return this.parent.children.length - 1;
        }
        return 0;
    }

    /**
     * Returns a boolean indicating whether this layer has its own styles or not
     */
    get hasOwnStyles(): boolean {
        return Object.entries(this._styles).length !== 0;
    }

    /**
     * Returns a boolean indicating whether this layer has any styles, either its own or inherited from children
     */
    get hasStyles(): boolean {
        return Object.entries(this.styles).length !== 0;
    }

    /**
     * Returns a boolean indicating whether this layer is uncessary or not. A layer is deemed unecessary if:
     * 
     * 1) It is inside of a component AND
     * 2) it does not have styles of its own AND
     *      3.a) It is the only child of its parent (this.siblingCount === 0) OR
     *      3.b) It only has one child (this.children.length === 1)
     */
    get isUnecessaryLayer(): boolean {
        return this.isWithinComponent && !this.hasOwnStyles && (this.siblingCount === 0 || this.children.length === 1);
    }

    /**
     * Returns a boolean indicating whether this layer is within a parent
     */
    get isWithinComponent(): boolean {
        if (this.parent){
            if(this.parent.type === 'COMPONENT'){
                return true;
            } else {
                return this.parent.isWithinComponent;
            }
        }
        return false;
    }
}


/**
 * Central point of access for managing Figma layers
 */
export class FigmaLayerProvider implements vscode.TreeDataProvider<FigmaLayer> {
    
    private changeTreeDataEmitter: vscode.EventEmitter<FigmaLayer> = new vscode.EventEmitter<FigmaLayer>();
	readonly onDidChangeTreeData: vscode.Event<FigmaLayer> = this.changeTreeDataEmitter.event;

    links!: LinksMap;
    treeItems: {[nodeId: string]: FigmaLayer}; // Direct access to any layer by ID
    rootItems: FigmaLayer[]; // List of root layers
    ignoreInternalLayers: boolean;

    /**
     * Builds the treeview provider from a list of figma components and links
     * @param components 
     */
    constructor(components: FigmaFile | undefined, ignoreInternalLayers: boolean){
        this.treeItems = {};
        this.rootItems = [];
        this.links = {};
        this.ignoreInternalLayers = ignoreInternalLayers;
    
        // Create map
        if(components){
            components.components.forEach(node => {
                this.rootItems.push(this.createTreeItemMap(node, components.meta));
            });
        }
    }

    /**
     * Updates the links in the view
     * @param links 
     */
    updateLinks(links: LinksMap){
        this.links = links;
        this.refresh();
    }

    /**
     * This method generates a map of layerid -> treeitem that will be used on the getChildren method.
     * This is needed to allow access to individual layers at any moment.
     * @param node Node from which layer will be created
     * @param meta Meta information about components (e.g. description)
     * @param parent Parent layer. If layer is a root layer, it will be undefined.
     */
    private createTreeItemMap(node: any, meta: ComponentsMeta, parent?: FigmaLayer): FigmaLayer{
        // Create layer item
        let layer = new FigmaLayer(node, parent);
        // Add to map
        this.treeItems[node.id] = layer;
        // Build the children
        if(node.children){
            node.children.forEach((child:any) => {
                layer.children.push(this.createTreeItemMap(child, meta, layer));
            });
        }
        return layer;
    }

    /**
     * Refreshes a layer in the view
     * @param layer 
     */
    refresh(layer?: FigmaLayer){
        this.changeTreeDataEmitter.fire(layer);
    }

    /**
     * Converts a FigmaLayer instance to one that can be displayed in the TreeView
     * @param element 
     */
    getTreeItem(element: FigmaLayer): vscode.TreeItem | Thenable<vscode.TreeItem> {
        let treeItem = new LayerTreeItem(element);
        if(element.id in this.links){
            treeItem.links = this.links[element.id];
        }
        return treeItem;
    }

    /**
     * Return the layer's parent
     * @param element 
     */
    getParent(element: FigmaLayer): FigmaLayer | undefined{
        return element.getPrunedParent();
    }

    /**
     * If an element is provided, return its children layers. If no element is provided, return the root nodes.
     * @param element Optional tree item
     */
    getChildren(element?: FigmaLayer): vscode.ProviderResult<FigmaLayer[]> {
        if(this.treeItems){
            let children: FigmaLayer[] = [];
            
            // Check whether this is a root node or not
            if(element){
                // Not the root. Return the children.
                children = element.getPrunedChildren();
            } else {
                // This is the root node
                children = this.rootItems;
            }

            // If figma sync is set to ignore internal layers, filter them out
            if(this.ignoreInternalLayers){
                children = children.filter(layer => {
                    return layer.name[0] !== internalLayerPrefix;
                });
            } 

            // Sort children alphabetically
            children.sort((a,b) => a.name.localeCompare(b.name));

            // Return resolved promise with items
            return Promise.resolve(children);
        }
    }    
}



/**
 * Wrapper to represent a FigmaLayer as a TreeItem for use in a TreeView
 */
export class LayerTreeItem extends vscode.TreeItem {
    
    layer: FigmaLayer;
    links: LayerSelectorLink[];

    constructor(layer: FigmaLayer){
        // If this is a kind of node that can house other nodes, set the collapsible state accordingly.
        let collapsibleState;
        if(['FRAME', 'GROUP', 'COMPONENT', 'INSTANCE'].includes(layer.type)){
            collapsibleState = vscode.TreeItemCollapsibleState.Collapsed;
        } else {
            collapsibleState = vscode.TreeItemCollapsibleState.None;
        }
        super(layer.name, collapsibleState);
        this.layer = layer;
        this.links = [];
        this.command = {
            command: 'figmasync.showCssProperties',
            title: 'Show CSS Properties for this layer',
            arguments: [layer]
        };
        this.contextValue = layer.hasStyles ? 'styled' : 'unstyled';
    }

    get id(): string {
        return this.layer.id;
    }

    /*  
        This seems to be necessary due to how the TreeItem constructor is implemented,
        but since I'm always reading the label from the underlying layer implementation,
        this isn't really necessary. So do nothing I guess.
    */
    set label(label:string){}

    get tooltip(): string {
        return this.id;
    }

    get label(): string {
        return this.layer.name;
    }

    get description(): string {
        if(this.isLinked){
            // Add all scope names
            let str = this.links.map(link => {
                return link.scopeName;
            }).join(' | ');

            // Remove newlines and return
            return str.replace(/\r?\n|\r/g, '');
        }
        return '';
    }

    get isLinked(): boolean {
        return this.links.length > 0;
    }

    get hasStyles(): boolean {
        return this.layer.hasStyles;
    }

    get iconPath() {
        // Get correct icon folder
        let folder = 'active';
        if(!this.isLinked){
            if(this.hasStyles){
                folder = 'inactive';
            } else {
                folder = 'disabled';
            }
        }
        // Return icon path
        return {
            light: path.join(__filename, '..', '..', 'media', 'sidebar', 'light', folder, `${this.layer.type}.svg`),
            dark: path.join(__filename, '..', '..', 'media', 'sidebar', 'dark', folder, `${this.layer.type}.svg`)
        };
    }
}


/**
 * TreeDataProvider for showing css properties for individual layers in the sidebar
 */
export class CssPropertiesProvider implements vscode.TreeDataProvider<string[]>{

    constructor(public properties: CssProperties){}

    getTreeItem(element: string[]): vscode.TreeItem | Thenable<vscode.TreeItem> {
        let item = new vscode.TreeItem(element[0] + ':', vscode.TreeItemCollapsibleState.None);
        item.description = element[1];
        return item;
    }
    
    getChildren(element?: string[]): vscode.ProviderResult<string[][]> {
        let props: string[][] = [];
        for(let prop in this.properties){
            props.push([prop, this.properties[prop]]);
        }
        return props;
    }
}