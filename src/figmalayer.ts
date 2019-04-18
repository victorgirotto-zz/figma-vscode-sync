import * as vscode from 'vscode';
import * as path from 'path';
import { FigmaFile, ComponentsMeta } from './figmafile';
import { LinksMap, LayerSelectorLink } from './link';

/**
 * Represents a Figma layer
 */
export class FigmaLayer {

    node: any;
    parent: FigmaLayer | undefined;

    constructor(node: any, parent?: FigmaLayer) {
        this.node = node;
        this.parent = parent;
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

    get path(): string[] {
        // If this is the root, return only its own label
        if(!this.parent){
            return [this.name];
        }
        // Otherwise, return this label preceded by the parent's path
        return [...this.parent.path, this.name];
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

    /**
     * Builds the treeview provider from a list of figma components and links
     * @param components 
     * @param links 
     */
    constructor(components?: FigmaFile, links?: LinksMap){
        this.treeItems = {};
        this.rootItems = [];
    
        // Create map
        if(components){
            components.components.forEach(node => {
                this.rootItems.push(this.createTreeItemMap(node, components.meta));
            });
        }

        // Add links
        if(links){
            this.updateLinks(links);
        } else {
            this.links = {};
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
            treeItem.link = this.links[element.id];
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
            let items: FigmaLayer[] = [];
            if(element){
                // This is not the root node
                items = element.children;
            } else {
                // This is the root node
                items = this.rootItems;
            }
            // Return resolved promise with items
            return Promise.resolve(items);
        }
    }    
}



/**
 * Wrapper to represent a FigmaLayer as a TreeItem for use in a TreeView
 */
export class LayerTreeItem extends vscode.TreeItem {
    
    layer: FigmaLayer;
    link?: LayerSelectorLink;

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
        return 'Path: ' + this.layer.path.join(' ');
    }

    get label(): string {
        return this.layer.name;
    }

    get description(): string {
        if(this.isLinked){
            return (this.link!).scopeName.replace(/\r?\n|\r/g, '');
        }
        return '';
    }

    get isLinked(): boolean {
        return this.link !== undefined;
    }

    get iconPath() {
        let folder = this.isLinked ? 'Active' : 'Inactive';
        return {
            light: path.join(__filename, '..', '..', 'media', 'sidebar', folder, `${this.layer.type}.svg`),
            dark: path.join(__filename, '..', '..', 'media', 'sidebar', folder, `${this.layer.type}.svg`)
        };
    }
}