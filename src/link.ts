import { FigmaLayer } from "./figmalayer";
import { StylesheetScope } from "./util/stylesheet";

export type LinksMap = { [key:string]: LayerSelectorLink };

export class LayerSelectorLink {

    layerId: string;
    layerName: string;
    layerPath: string[];

    scopeId: string;
    scopeName: string;
    scopeLocalName: string;

    constructor(layer: FigmaLayer, scope: StylesheetScope){
        this.layerId = layer.id;
        this.layerName = layer.name;
        this.layerPath = layer.path;

        this.scopeId = scope.cssScopeName;
        this.scopeName = scope.resolvedScopeName;
        this.scopeLocalName = scope.selector;
    }

}