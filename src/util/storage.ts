import * as vscode from 'vscode';
import { FigmaComponents } from '../figma-components';

export type Links = { [layerId:string]: string };

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

    addLink(layerId: string | undefined, cssSelector:string){
        // Get current links
        let links = this.links;
        if(layerId){
            links[layerId] = cssSelector;
        }
        // Update storage value
        this.context.workspaceState.update(`links-${this.uri}`, links);
    }

    get links(): Links{
        let links = this.context.workspaceState.get(`links-${this.uri}`) as Links;
        if(!links){
            links = {};
        }
        return links;
    }

    clearData(){
        this.context.workspaceState.update(`filename-${this.uri}`, undefined);
        this.context.workspaceState.update(`filekey-${this.uri}`, undefined);
        this.context.workspaceState.update(`components-${this.uri}`, undefined);
    }

}