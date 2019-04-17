import * as vscode from 'vscode';
import { FigmaFile } from '../figmafile';
import { LayerSelectorLink, LinksMap } from '../link';
import { FigmaLayer } from '../figmalayer';

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
    addLinkByLayer(layer: LayerSelectorLink){
        // Get current links
        let links = this.getLinksByLayer();
        // Add the new link
        links[layer.layerId] = layer;
        // Update storage value
        this.context.workspaceState.update(`links-${this.uri}`, links);
    }

    /**
     * Removes the link for a given layer
     * @param layerId 
     */
    removeLinkByLayer(layer: FigmaLayer){
        let links = this.getLinksByLayer();
        // Delete links for this layer
        delete links[layer.id];
        // Update storage value
        this.context.workspaceState.update(`links-${this.uri}`, links);
    }

    /**
     * Returns a LinksMap of links organized by layer ID
     */
    getLinksByLayer(): LinksMap {
        let layerLinks = this.context.workspaceState.get<LinksMap>(`links-${this.uri}`);
        if(layerLinks){
            return layerLinks;
        }
        return ({} as LinksMap);
    }

    /**
     * Returns a LinksMap of links organized by selector ID
     */
    getLinksBySelector(): LinksMap{
        let linksBySelector: LinksMap = {};
        let linksByLayer = this.getLinksByLayer();
        if(!linksByLayer){
            return {};
        }
        // Build inverted index
        for(let layerId in linksByLayer){
            let link = linksByLayer[layerId];
            linksBySelector[link.scopeId] = link;
        }
        return linksBySelector;
    }

    /**
     * Erases all figma sync data related to a file
     */
    clearData(){
        console.log('Cleaning everything');
        this.context.workspaceState.update(`filekey-${this.uri}`, undefined);
        this.context.workspaceState.update(`figmaFile-${this.uri}`, undefined);
        this.context.workspaceState.update(`links-${this.uri}`, undefined);
    }

}