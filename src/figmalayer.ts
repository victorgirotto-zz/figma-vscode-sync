import * as vscode from 'vscode';
import * as path from 'path';
import { FigmaFile, ComponentsMeta } from './figmafile';
import { LinksMap, LayerSelectorLink } from './link';
import { CssProperties } from './stylesheet';
import { Parser } from './figmanodeparser';
import { INSPECT_MAX_BYTES } from 'buffer';

const internalLayerPrefix = '_';

/**
 * Represents a Figma layer
 */
export class FigmaLayer {

    node: any;
    parent: FigmaLayer | undefined;
    styles: CssProperties = {};

    constructor(node: any, parent?: FigmaLayer) {
        this.node = node;
        this.parent = parent;
        this.styles = new Parser(node).parse();
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

    /**
     * Returns all children, replacing its unecessary children with non-unecessary descendents (see isUnecessary getter description)
     */
    getPrunedChildren(): FigmaLayer[] {
        let children = this.children;
        let initialLength = children.length;
        console.log(`Pruned: ${this.name}`);

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
        console.log(`END: ${this.name}`);
        return children;
    }

    /**
     * Returns an array of strings with the path between the root until the current node (inclusive).
     * The root node will be the first item in the array, and the current item will be the last.
     */
    get path(): string[] {
        // If this is the root, return only its own label
        if(!this.parent){
            return [this.name];
        }
        // Otherwise, return this label preceded by the parent's path
        return [...this.parent.path, this.name];
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

    get hasStyles(): boolean {
        return Object.entries(this.styles).length !== 0;
    }

    /**
     * Returns a boolean indicating whether this layer is uncessary or not. A layer is deemed unecessary if:
     * 
     * 1) it does not have styles of its own AND
     *      2.a) It is the only child of its parent (this.siblingCount === 0) OR
     *      2.b) It only has one child (this.children.length === 1)
     */
    get isUnecessaryLayer(): boolean {
        return !this.hasStyles && (this.siblingCount === 0 || this.children.length === 1);
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
        return element.parent;
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
                // Get the element's children
                if(element.type === 'COMPONENT' || element.isWithinComponent){
                    // If the children are within a component, prune them
                    children = element.getPrunedChildren();
                } else {
                    // Otherwise, get all chidlren
                    children = element.children;
                }
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
    }

    get id(): string {
        return this.layer.id;
    }

    set label(label:string){
        // This seems to be necessary due to how the TreeItem constructor is implemented,
        // but since I'm always reading the label from the underlying layer implementation,
        // this isn't really necessary. So do nothing I guess.
    }

    get tooltip(): string {
        return JSON.stringify(this.layer.styles);
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