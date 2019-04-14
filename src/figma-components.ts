import * as Figma from 'figma-js';
import { FigmaUtil } from './util/figma-util';

export class FigmaComponents {

    lastModified: string;
    meta: {[key:string]: Figma.Component};
    components: any[] = [];

    /**
     * Build a FigmaDocument instance based on a Figma.FileResponse. This instance allows searching of property values within figma nodes.
     * 
     * @param data 
     */
    constructor(data: Figma.FileResponse){
        // First, go through all components and parse their meta
        this.meta = data.components;
        this.lastModified = data.lastModified;

        // We have the list of components. Now, find and parse their nodes.
        for(let componentId in this.meta){
            
            // Find node and add it to the list of components
            let figmaNode = FigmaUtil.getAllChildren(data.document, (node:any) => {
                return node.type === 'COMPONENT' && node.id === componentId;
            })[0];

            this.components.push(figmaNode);
        }
    }
}