import * as vscode from 'vscode';
import * as path from 'path';
import { FigmaFile, ComponentsMeta } from './figmafile';
import { CssProperties } from './stylesheet';
import { FigmaUtil } from './util/figma-util';

const internalLayerPrefix = '_';

/**
 * Represents a Figma layer
 */
export class FigmaLayer {

    fileKey: string;
    node: any;
    parent: FigmaLayer | undefined;
    _styles: CssProperties = {};

    constructor(fileId:string, node: any, parent?: FigmaLayer) {
        this.fileKey = fileId;
        this.node = node;
        this.parent = parent;
        this._styles = FigmaUtil.GetCssProperties(node);
    }

    /**
     * Returns the id for the layer, comprised of fileKey:layerId
     */
    get id(): string {
        return `${this.fileKey}:${this.node.id}`;
    }

    /**
     * Returns the id for the layer
     */
    get layerId(): string {
        return this.node.id;
    }

    get children(): FigmaLayer[] {
        if(!this.node.children){
            return [];
        }
        return this.node.children.map((c: FigmaLayer) => new FigmaLayer(this.fileKey, c, this));
    }
    
    get name(): string {
        return this.node.name;
    }

    get type(): string {
        return this.node.type;
    }

    get styles(): CssProperties {

        // A document should not have styles
        if(this.type === 'DOCUMENT'){
            return {};
        }

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

    /**
     * Returns a formatted string with the layer's properties.
     * @indent number of tabs before the property. 
     */
    getFormattedStyles(indent?: number): string{
        let tab = indent ? '\t'.repeat(indent) : '';
        let styles = '';
        for(let prop in this.styles){
            styles += `${tab}${prop}: ${this.styles[prop]};\n`;
        }
        return styles;
    }

    /**
     * Recursively returns all text content from this layer and all of its children
     */
    getTextContent(): string[] {
        let texts: string[] = [];

        if(this.type === 'TEXT'){
            // If this is a text layer, return its text
            texts = [this.node.characters];
        } else {
            // This is not a text layer. Get its children's text and concatenate with current array
            this.children.forEach(child => {
                texts = [...texts, ...child.getTextContent()];
            });
        }
        // Return texts
        return texts;
    }
}


/**
 * Central point of access for managing Figma layers
 */
export class FigmaLayerProvider implements vscode.TreeDataProvider<FigmaLayer> {
    
    private changeTreeDataEmitter: vscode.EventEmitter<FigmaLayer> = new vscode.EventEmitter<FigmaLayer>();
	readonly onDidChangeTreeData: vscode.Event<FigmaLayer> = this.changeTreeDataEmitter.event;

    treeItems: {[nodeId: string]: FigmaLayer}; // Direct access to any layer by ID
    rootItems: FigmaLayer[]; // List of root layers
    ignoreInternalLayers: boolean;

    /**
     * Builds the treeview provider from a list of figma components
     * @param figmaFiles
     * @param ignoreInternalLayers boolean indicating whether internal (unecessary) layers should be ignored or not
     */
    constructor(figmaFiles: FigmaFile[], ignoreInternalLayers: boolean){
        this.treeItems = {};
        this.rootItems = [];
        this.ignoreInternalLayers = ignoreInternalLayers;
    
        // Create map of layers
        if(figmaFiles){
            figmaFiles.forEach(file => {
                file.nodes.forEach(component => {
                    this.rootItems.push(this.createTreeItemMap(file.key, component, file.meta));
                });
            });
        }
    }

    /**
     * This method generates a map of layerid -> treeitem that will be used on the getChildren method.
     * This is needed to allow access to individual layers at any moment.
     * @param node Node from which layer will be created
     * @param meta Meta information about components (e.g. description)
     * @param parent Parent layer. If layer is a root layer, it will be undefined.
     */
    private createTreeItemMap(fileId: string, node: any, meta: ComponentsMeta, parent?: FigmaLayer): FigmaLayer{
        // Create layer item
        let layer = new FigmaLayer(fileId, node, parent);
        // Add to map
        this.treeItems[node.id] = layer;
        // Build the children
        if(node.children){
            node.children.forEach((child:any) => {
                layer.children.push(this.createTreeItemMap(fileId, child, meta, layer));
            });
        }
        return layer;
    }

    /**
     * Refreshes a layer in the view. If no layer is specified, refreshes everything.
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
        return new LayerTreeItem(element);
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

    constructor(layer: FigmaLayer){
        // Determine collapsible state
        // If this is a kind of node that can house other nodes, set the collapsible state accordingly.
        let collapsibleState;
        if(['FRAME', 'GROUP', 'COMPONENT', 'INSTANCE'].includes(layer.type)){
            collapsibleState = vscode.TreeItemCollapsibleState.Collapsed;
        } else if(layer.type === 'DOCUMENT'){
            collapsibleState = vscode.TreeItemCollapsibleState.Expanded;
        } else {
            collapsibleState = vscode.TreeItemCollapsibleState.None;
        }

        // Build the item
        super(layer.name, collapsibleState);
        this.layer = layer;
        this.command = {
            command: 'figmasync.showCssProperties',
            title: 'Show CSS Properties for this layer',
            arguments: [layer]
        };

        // Set context value depending on the layer type and styles
        if(layer.type === 'DOCUMENT'){
            this.contextValue = layer.type.toLowerCase();
        } else {
            this.contextValue = layer.hasStyles ? 'styled' : 'unstyled';
        }
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

    /**
     * Returns a boolean indicating whether this layer has any styles or not
     */
    get hasStyles(): boolean {
        return this.layer.hasStyles && this.layer.type !== 'DOCUMENT';
    }

    get iconPath() {
        // Get correct icon folder
        let folder = 'active';
        if(this.hasStyles){
            folder = 'inactive';
        } else {
            folder = 'disabled';
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

    constructor(public properties?: CssProperties){}

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