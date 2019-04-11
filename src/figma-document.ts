import * as Figma from 'figma-js';
import { FigmaUtil } from './util/figma-util';
import { LayerStyle, FigmaSyncComponent } from './layer-style';

export class FigmaDocument {

    components: {[id:string]: FigmaSyncComponent} = {};

    /**
     * Build a FigmaDocument instance based on a Figma.FileResponse. This instance allows searching of property values within figma nodes.
     * 
     * @param data 
     */
    constructor(data: Figma.FileResponse){
        // First, go through all components and only select those that have metadata on them
        for(let id in data.components){
            let component = data.components[id];
            let selector = FigmaUtil.extractStringMetadata(component.description);
            if(selector){
                // Component has a selector. Add to map of components.
                let layerStyle = new FigmaSyncComponent(id, component.name, component.description);
                this.components[selector] = layerStyle;
            }
        }

        // We have the list of components. Now, find and parse their nodes.
        for(let selector in this.components){
            let component = this.components[selector];
            
            // Find node
            let figmaNode = FigmaUtil.getAllChildren(data.document, (node:any) => {
                return node.type === 'COMPONENT' && node.id === component.id;
            })[0];

            // Parse it
            component.style.parseProperties(figmaNode);
        }

        console.log(this.components);
    }

    /**
     * Returns the CSS property value for a node in Figma matching the selectors.
     * If there is no matching value, returns an empty string.
     * 
     * @param selectors The list of selectors, from broader to more specific, that will be searched on the Figma file
     * @param property The property that will 
     */
    findPropertyValue(selectors:string[], property: string): string {
        let value: string = '';

        // Look for component matching the topmost selector
        let selector = selectors.shift() as string;
        let component = this.components[selector];
        if(component){
            // Found component.
            if(selectors.length > 0){
                // Keep going if there are still selectors.
                // TODO
            } else {
                // Find property
                if(property in component.style){
                    value = component.style.props[property];
                }                
            }
        }
        return value;
    }

}