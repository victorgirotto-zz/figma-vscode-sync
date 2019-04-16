import * as vscode from 'vscode';
import { FigmaComponents } from '../figma-components';
import { FigmaLayer } from '../figmalayer';
import { StylesheetScope } from './stylesheet';

export type LinksMap = { [layerId:string]: LayerSelectorLink };

export class LayerSelectorLink {

    public layerId: string;
    public layerPath: string[];
    public selector: string;

    constructor(layer: FigmaLayer, scope: StylesheetScope){
        let id = layer.id ? layer.id : '';
        this.layerId = id;
        this.layerPath = layer.path;
        this.selector = scope.selector;
    }

}

export class FileStorage {

    uri: string;
    context: vscode.ExtensionContext;

    constructor(uri: string, context: vscode.ExtensionContext){
        this.uri = uri;
        this.context = context;
    }

    set fileName(name: string){
        this.context.workspaceState.update(`filename-${this.uri}`, name);
    }

    get fileName(): string{
        return this.context.workspaceState.get(`filename-${this.uri}`) as string;
    }

    set fileKey(key: string){
        this.context.workspaceState.update(`filekey-${this.uri}`, key);
    }

    get fileKey(): string{
        return this.context.workspaceState.get(`filekey-${this.uri}`) as string;
    }

    set components(components: FigmaComponents){
        this.context.workspaceState.update(`components-${this.uri}`, components);
    }

    get components(): FigmaComponents {
        return this.context.workspaceState.get(`components-${this.uri}`) as FigmaComponents;
    }

    addLink(link: LayerSelectorLink){
        // Get current links
        let links = this.links;
        // Add the new link
        links[link.layerId] = link;
        // Update storage value
        this.context.workspaceState.update(`links-${this.uri}`, links);
    }

    removeLinks(layerId: string){
        let links = this.links;
        // Delete links for this layer
        delete links[layerId];
        // Update storage value
        this.context.workspaceState.update(`links-${this.uri}`, links);
    }

    get links(): LinksMap{
        let links = this.context.workspaceState.get(`links-${this.uri}`) as LinksMap;
        if(!links){
            links = {};
        }
        return links;
    }

    clearData(){
        this.context.workspaceState.update(`filename-${this.uri}`, undefined);
        this.context.workspaceState.update(`filekey-${this.uri}`, undefined);
        this.context.workspaceState.update(`components-${this.uri}`, undefined);
        this.context.workspaceState.update(`links-${this.uri}`, undefined);
    }

}