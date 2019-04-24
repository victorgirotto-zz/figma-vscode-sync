import * as Figma from 'figma-js';
import { CssProperties } from '../stylesheet';

/*
    A set of fuctions for interacting with nodes from figma-js

    TODO I'm using the any type for the nodes since figma-js does not seem to
    have a supertype with the children property shared across different types of nodes.
    (I thought the Node type alias was supposed to be that, but intellisense isn't working with it.)
*/

export class FigmaUtil {

    static getCssProperties(node: any): CssProperties{
        let css: CssProperties = {};
        for(let prop in node){
            if(node.hasOwnProperty(prop)){
                // Handle the prop. If no handler exists for it, props will remain unchanged.
                css = {...css, ...FigmaUtil.getCssFromNodeProp(prop, node)};
            }
        }
        return css;
    }

    static getCssFromNodeProp(prop: string, node: any): CssProperties{
        let css: CssProperties = {};
        let value = node[prop];
        switch (prop) {
            
            case 'style':
                css ={
                    'font-family': `'${value.fontFamily}'`,
                    'font-size': FigmaUtil.px(value.fontSize),
                    'font-weight': value.fontWeight,
                    'line-height': FigmaUtil.px(value.lineHeightPx)
                };
                break;

            case 'fills':
                var prop = node.type === 'TEXT' ? 'color' : 'background-color';
                // Array of fills {blendMode, type, color(rgba)}
                for (let i = 0; i < value.length; i++) {
                    const fill = value[i];
                    if(fill.type === 'SOLID'){
                        let color = FigmaUtil.getColorString(fill);
                        if(color){
                            css[prop] = color;
                        }
                    }
                }
                break;

            case 'strokes':
                for (let i = 0; i < value   .length; i++) {
                    const stroke = value    [i];
                    if(stroke.type === 'SOLID'){
                        let color = FigmaUtil.getColorString(stroke.color);
                        if(color){
                            css['border-style'] = 'solid';         
                            css['border-color'] = color;        
                        }
                    }
                }
                break;

            case 'strokeWeight':
                // Only add stroke weight if there are borders
                if (node.strokes.length > 0){
                    css = {'border-width': FigmaUtil.px(value)};
                }
                break;

            case 'cornerRadius':
                css = {'border-radius': FigmaUtil.px(value)};
                break;

            case 'effects':
                value.forEach((effect: any) => {
                    if (effect.type === 'INNER_SHADOW' || effect.type === 'DROP_SHADOW'){
                        // Drop shadows
                        var inset = effect.type === 'INNER_SHADOW' ? 'inset ' : ''; 
                        css['box-shadow'] = inset + ' ' +
                            FigmaUtil.px(effect.offset.x) + ' ' +
                            FigmaUtil.px(effect.offset.y) + ' ' +
                            FigmaUtil.px(effect.radius) + ' ' +
                            FigmaUtil.getColorString(effect.color);
                    }
                    // TODO handle blur
                });
                break;
        }
        // Return properties
        return css;
    }

    /**
     * Returns a string with the number + px postfix
     * @param number Number
     */
    static px(number:number){
        return number + 'px';
    }

    /**
    * Returns a color string for a Figma.Color. If alpha is different than 1, the string will be in rgba format. Otherwise, hex.
    * 
    * @param color Figma.Color instance
    */
    static getColorString(fill: Figma.Paint): string | undefined{
        let color = fill.color;
        if(color){
            // Create rounding fn
            let round = (n:number) => Math.round(n * 10) / 10;
            // Round values
            let alpha = round(color.a * fill.opacity);
            let r = color.r;
            let g = color.g;
            let b = color.b;
            if(alpha < 1){
                // Return in rgba
                return `rgba(${round(r)},${round(g)},${round(b)},${alpha})`;
            } else {
                // Return in HEX
                let convert = (channel: number) => { return Math.floor(channel * 255).toString(16).padStart(2,'0'); };
                return ('#'+convert(r)+convert(g)+convert(b)).toUpperCase();
            }
        }
    }

    /**
     * Gets a css selector from a string. Format: <data>
     * If metadata doesn't exist, return undefined
     * 
     * @param text the text from which the metadata should be extracted.
     */
    static extractStringMetadata(text: string): string | undefined{
        let bracketContent = text.match(/<([^\s>]+)(\s|>)+/);
        if(bracketContent && bracketContent.length > 0){
            return bracketContent[1];
        }
        return;
    }
}