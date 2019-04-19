import * as vscode from 'vscode';
import { FigmaFile } from './figmafile';
import { IdOrder } from './link';
import { FigmaLayer } from './figmalayer';

export class FileStorage {
    uri: string;
    context: vscode.ExtensionContext;

    constructor(uri: string, context: vscode.ExtensionContext){
        this.uri = uri;
        this.context = context;
    }

    set fileKey(key: string | undefined){
        this.context.workspaceState.update(`filekey-${this.uri}`, key);
    }

    get fileKey(): string | undefined{
        return this.context.workspaceState.get(`filekey-${this.uri}`);
    }

    set components(components: FigmaFile){
        this.context.workspaceState.update(`figmaFile-${this.uri}`, components);
    }

    get components(): FigmaFile {
        return this.context.workspaceState.get(`figmaFile-${this.uri}`) as FigmaFile;
    }

    /**
     * Adds a link between a layer and a css scope
     * @param layer 
     */
    addLink(linkIds: string[]){
        // Get current links
        let links = this.links;
        // Check if link already exists
        let linkExists = links.some((storedLinkIds) => {
            // Return true if both layer and scope ids are the same
            return storedLinkIds[IdOrder.Layer] === linkIds[IdOrder.Layer] && 
                storedLinkIds[IdOrder.Scope] === linkIds[IdOrder.Scope];
        });

        // If it doesn't, add the new link
        if(!linkExists){
            // Add the new link
            links.push(linkIds);
            // Update storage value
            this.context.workspaceState.update(`links-${this.uri}`, links);
        }
    }

    /**
     * Removes the link for a given layer
     * @param layerId 
     */
    removeLink(linkIds: string[]){
        let links = this.links;
        // Filter out the matching link
        links.filter((storedLinkIds) => {
            // Include in array if either element is different
            return storedLinkIds[IdOrder.Layer] !== linkIds[IdOrder.Layer] || 
                storedLinkIds[IdOrder.Scope] !== linkIds[IdOrder.Scope];
        });
        // Update storage value
        this.context.workspaceState.update(`links-${this.uri}`, links);
    }

    /**
     * Returns the stored array of link ids
     */
    get links(): string[][] {
        let links = this.context.workspaceState.get<string[][]>(`links-${this.uri}`);
        if(links){
            return links;
        }
        else {
            return [];
        }
    }

    /**
     * Erases all figma sync data related to a file
     */
    clearData(){
        this.context.workspaceState.update(`filekey-${this.uri}`, undefined);
        this.context.workspaceState.update(`figmaFile-${this.uri}`, undefined);
        this.context.workspaceState.update(`links-${this.uri}`, undefined);
    }

}