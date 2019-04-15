import * as vscode from 'vscode';
import * as path from 'path';
import { FigmaComponents } from './figma-components';
import { CurrentFileUtil } from './util/current-file-util';
import { Links } from './util/storage';

export class FigmaLayerProvider implements vscode.TreeDataProvider<FigmaLayer> {
    
    private changeTreeDataEmitter: vscode.EventEmitter<FigmaLayer> = new vscode.EventEmitter<FigmaLayer>();
	readonly onDidChangeTreeData: vscode.Event<FigmaLayer> = this.changeTreeDataEmitter.event;

    components: FigmaComponents | undefined;
    links: Links;

    constructor(components?: FigmaComponents, links?: Links){
        this.components = components;
        this.links = links ? links : {};
    }

    refresh(layer?: FigmaLayer){
        this.changeTreeDataEmitter.fire(layer);
    }

    getTreeItem(element: FigmaLayer): vscode.TreeItem | Thenable<vscode.TreeItem> {
        return element;
    }

    getChildren(element?: FigmaLayer | undefined): vscode.ProviderResult<FigmaLayer[]> {
        // Check if there are components to be displayed
        if(this.components){ // There are components. Add them.
            let meta = this.components.meta;
            
            // Create mapping function
            let toTreeItem = (component:any)=>{
                
                // If this is a kind of node that can house other nodes, set the collapsible state accordingly.
                let collapsibleState;
                if(['FRAME', 'GROUP', 'COMPONENT', 'INSTANCE'].includes(component.type)){
                    collapsibleState = vscode.TreeItemCollapsibleState.Collapsed;
                } else {
                    collapsibleState = vscode.TreeItemCollapsibleState.None;
                }
                
                // Setup layer information
                let description = component.id in meta ? meta[component.id].description : '';
                let link = this.links[component.id];
                // Create layer item
                return new FigmaLayer(
                    component, 
                    component.name, 
                    collapsibleState, 
                    component.type, 
                    description,
                    link
                );
            };
    
            // Map the element's children to FigmaLayers

            // First, get the children of the root or of the included component
            let nodes = this.components.components;
            if(element){
                nodes = element.node.children;
            }

            // Create items
            let items: FigmaLayer[] = [];
            if(nodes){
                // Map the nodes to tree items
                items = nodes.filter(c => {
                    return c; // This filtering is necessary to skip components that have been deleted, but which still have instances around the file.
                }).map(c => {
                    return toTreeItem(c);
                }).sort((a,b) => a.label.localeCompare(b.label));
            }

            // Return 
            return Promise.resolve(items);
        } else {
            
            // There are no components. Check if file type is correct.
            if(CurrentFileUtil.isFileLanguageID('less')){
                // This is a less file.
                // TODO find out how to display message saying how to link this file with a Figma file
            } else {
                // This is not a less file. 
                // TODO find out how to display message saying that this extension only works on less files
            }
        }
    }    
}

export class FigmaLayer extends vscode.TreeItem {

    constructor(
        public node: any,
		public readonly label: string,
        public readonly collapsibleState: vscode.TreeItemCollapsibleState,
        public type: string,
        public moreInformation: string,
        public link: string,
        public readonly command?: vscode.Command
	) {
        super(label, collapsibleState);
        this.id = node.id;
        this.contextValue = this.type;
    }
    
    get tooltip(): string {
        return this.moreInformation ? this.moreInformation : '';
    }

    get description(): string {
        return this.link;
    }

    iconPath = {
        light: path.join(__filename, '..', '..', 'media', 'sidebar', `${this.type}.svg`),
		dark: path.join(__filename, '..', '..', 'media', 'sidebar', `${this.type}.svg`)
    };

    setLink(selector: string){
        this.link = selector;
    }

}