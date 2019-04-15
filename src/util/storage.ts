import * as vscode from 'vscode';
import { FigmaComponents } from '../figma-components';

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

    clearData(){
        this.context.workspaceState.update(`filename-${this.uri}`, undefined);
        this.context.workspaceState.update(`filekey-${this.uri}`, undefined);
        this.context.workspaceState.update(`components-${this.uri}`, undefined);
    }

}