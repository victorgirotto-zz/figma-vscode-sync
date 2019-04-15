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

        // Add children from all pages
        data.document.children.forEach((p: any) => {
            this.components.push(...p.children);
        });
        
        // Sort alphabetically
        this.components.sort((a,b) => a.name.localeCompare(b.name));
    }
}