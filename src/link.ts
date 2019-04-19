import { FigmaLayer } from "./figmalayer";
import { StylesheetScope } from "./stylesheet";

export type LinksMap = { [key:string]: LayerSelectorLink[] };

export enum IdOrder {
    Layer=0,
    Scope=1,
}

export class LayerSelectorLink {  

    layer: FigmaLayer;
    scope: StylesheetScope;

    constructor(layer: FigmaLayer, scope: StylesheetScope){
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
        return this.scope.selector;
    }

    /**
     * Returns a string array with the index of the (1) layer and  (2) scope
     */
    get ids(): string[] {
        return [this.layerId, this.scopeId];
    }

}