import * as Figma from 'figma-js';
import { FigmaUtil } from './util/figma-util';

/**
 * 
 */
export type CssProperties = {[prop:string]: string};

/**
 * 
 */
export class FigmaSyncComponent {
    id: string;
    name: string;
    description: string;
    style: LayerStyle;

    constructor(id:string, name:string, description:string){
        this.id = id;
        this.name = name;
        this.description = description;
        this.style = new LayerStyle();
    }
}

/**
 * 
 */
export class LayerStyle {
    props: CssProperties = {};
    children: LayerStyle[] = [];

    /**
     * Builds a component's style tree based on the figma node passed as parameter.
     * This tree is a "flattened" version of the component's layer structure in Figma.
     * By that, I mean that this function will:
     * 
     * 
     * @param node Figma.Node that will be parsed
     */
    parseProperties(node: any){
        this.props = new Parser(node).parse();
        // this.props = new Parser(node.children[1]).parse(); // This yields some styles
    }
}


/**
 * 
 */
export class Parser {
    node: any;

    constructor(node: any){
        this.node = node;
    }

    /*
        Actives all handlers to parse styles from a Figma node and returns a map of css props -> values
    */
    parse(): CssProperties{
        let props = {};
        // Go through the props in the node
        for(let prop in this.node){
            if(this.node.hasOwnProperty(prop)){
                // Handle the prop. If no handler exists for it, props will remain unchanged.
                props = {...props, ...this.handleProp(prop)};
            }
        }
        return props;
    }

    /**
     * Returns a string with the number + px postfix
     * @param number Number
     */
    px(number:number){
        return number + 'px';
    }

    /**
     * Parses a figma node property and returns an object of css properties and values. 
     */
    handleProp(prop: string): CssProperties {
        let css: CssProperties = {};
        let value = this.node[prop];
        switch (prop) {
            
            case 'style':
                css ={
                    'font-family': `'${value.fontFamily}'`,
                    'font-size': this.px(value.fontSize),
                    'font-weight': value.fontWeight,
                    'line-height': this.px(value.lineHeightPx)
                };
                break;

            case 'fills':
                
                var prop = this.node.type === 'TEXT' ? 'color' : 'background-color';
                // Array of fills {blendMode, type, color(rgba)}
                for (let i = 0; i < value.length; i++) {
                    const fill = value[i];
                    if(fill.type === 'SOLID'){
                        css[prop] = FigmaUtil.getColorString(fill.color);         
                    }
                }
                break;

            case 'strokes':
                for (let i = 0; i < value   .length; i++) {
                    const stroke = value    [i];
                    if(stroke.type === 'SOLID'){
                        css['border-style'] = 'solid';         
                        css['border-color'] = FigmaUtil.getColorString(stroke.color);       
                    }
                }
                break;

            case 'strokeWeight':
                // Only add stroke weight if there are borders
                if (this.node.strokes.length > 0){
                    css = {'border-width': this.px(value)};
                }
                break;

            case 'cornerRadius':
                css = {'border-radius': this.px(value)};
                break;

            case 'effects':
                value.forEach((effect: any) => {
                    if (effect.type === 'INNER_SHADOW' || effect.type === 'DROP_SHADOW'){
                        // Drop shadows
                        var inset = effect.type === 'INNER_SHADOW' ? 'inset ' : ''; 
                        css['box-shadow'] = inset + 
                            this.px(effect.offset.x) + 
                            this.px(effect.offset.y) + 
                            this.px(effect.radius) + 
                            FigmaUtil.getColorString(effect.color);
                    }
                    // TODO handle blur
                });
                break;
        }
        return css;
    }
}
