import { FigmaLayer } from "./sidebar";
import { StylesheetScope } from "./stylesheet";

export type LinksMap = { [key:string]: LayerSelectorLink[] };

export enum IdOrder {
    Layer=0,
    Scope=1,
}

export class LayerSelectorLink {  

    localFile: string;
    layer: FigmaLayer;
    scope: StylesheetScope;

    constructor(localFile: string, layer: FigmaLayer, scope: StylesheetScope){
        this.localFile = localFile;
        this.layer = layer;
        this.scope = scope;
    }

    get layerId(): string {
        return this.layer.id;
    }
    
    get layerName(): string {
        return this.layer.name;
    }
    
    get layerPath(): string[] {
        return this.layer.path;
    }

    get scopeId(): string {
        return this.scope.cssScopeName;
    }
    
    get scopeName(): string {
        return this.scope.resolvedScopeName;
    }

    /**
     * Returns a string array with the index of the (1) layer and  (2) scope
     */
    get ids(): string[] {
        return [this.layerId, this.scopeId];
    }

}