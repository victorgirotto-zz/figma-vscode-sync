import { FigmaUtil } from "./figmautil";

export class Parser {
    
    node: any;

    constructor(node: any){
        this.node = node;
    }

    px(number:number){
        return number + 'px';
    }

    /*
        Actives all handlers to parse styles from a Figma node and returns a map of css props -> values
    */
    parse(): { [string:string]: Object }{
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

    /*
        Parses a figma node property and returns an object of css properties and values.
    */
    handleProp(prop: string): { [string:string]: Object } {
        let css: { [string:string]: Object } = {};
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