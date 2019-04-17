import { FigmaLayer } from "./figmalayer";
import { StylesheetScope } from "./util/stylesheet";

export type LinksMap = { [key:string]: LayerSelectorLink };

export class LayerSelectorLink {

    layerId: string;
    scopeId: string;
    layerName: string;
    scopeName: string;

    constructor(layer: FigmaLayer, scope: StylesheetScope){
        this.layerId = layer.id;
        this.scopeId = scope.cssScopeName;
        this.layerName = layer.name;
        this.scopeName = scope.resolvedScopeName;
    }

}