import * as Figma from 'figma-js';
import { CssProperties } from '../stylesheet';

/*
    A set of fuctions for interacting with nodes from figma-js

    TODO I'm using the any type for the nodes since figma-js does not seem to
    have a supertype with the children property shared across different types of nodes.
    (I thought the Node type alias was supposed to be that, but intellisense isn't working with it.)
*/

export class FigmaUtil {

    static GetCssProperties(node: any): CssProperties{
        let css: CssProperties = {};
        for(let prop in node){
            if(node.hasOwnProperty(prop)){
                // Handle the prop. If no handler exists for it, props will remain unchanged.
                css = {...css, ...FigmaUtil.GetCssFromNodeProp(prop, node)};
            }
        }
        return css;
    }

    private static GetCssFromNodeProp(prop: string, node: any): CssProperties{
        let css: CssProperties = {};
        let value = node[prop];
        switch (prop) {
            
            case 'style':
                css ={
                    'font-family': `'${value.fontFamily}'`,
                    'font-size': FigmaUtil.Px(value.fontSize),
                    'font-weight': value.fontWeight,
                    'line-height': FigmaUtil.Px(value.lineHeightPx)
                };
                break;

            case 'fills':
                var prop = node.type === 'TEXT' ? 'color' : 'background-color';
                // Array of fills {blendMode, type, color(rgba)}
                for (let i = 0; i < value.length; i++) {
                    const fill = value[i];
                    if(fill.type === 'SOLID'){
                        let color = FigmaUtil.GetColorString(fill);
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
                        let color = FigmaUtil.GetColorString(stroke.color);
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
                    css = {'border-width': FigmaUtil.Px(value)};
                }
                break;

            case 'cornerRadius':
                css = {'border-radius': FigmaUtil.Px(value)};
                break;

            case 'effects':
                value.forEach((effect: any) => {
                    if (effect.type === 'INNER_SHADOW' || effect.type === 'DROP_SHADOW'){
                        // Drop shadows
                        var inset = effect.type === 'INNER_SHADOW' ? 'inset ' : ''; 
                        css['box-shadow'] = inset + ' ' +
                            FigmaUtil.Px(effect.offset.x) + ' ' +
                            FigmaUtil.Px(effect.offset.y) + ' ' +
                            FigmaUtil.Px(effect.radius) + ' ' +
                            FigmaUtil.GetColorString(effect.color);
                    }
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
    static Px(number:number){
        return number + 'px';
    }

    /**
    * Returns a color string for a Figma.Color. If alpha is different than 1, the string will be in rgba format. Otherwise, hex.
    * 
    * @param color
    */
    static GetColorString(fill: any): string | undefined{
        let color = 'color' in fill ? fill.color : fill;
        let opacity = 'opacity' in fill ? fill.opacity : 1;
        if(color){
            // Create rounding fn
            let round = (n:number) => Math.round(n * 100) / 100;
            // Round values
            let alpha = round(color.a * opacity);
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
    static ExtractStringMetadata(text: string): string | undefined{
        let bracketContent = text.match(/<([^\s>]+)(\s|>)+/);
        if(bracketContent && bracketContent.length > 0){
            return bracketContent[1];
        }
        return;
    }
}