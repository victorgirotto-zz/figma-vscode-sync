import * as vscode from "vscode";
import { CurrentFileUtil } from "./current-file-util";
import { CssProperties } from "../stylesheet";
import * as cssprop from "css-property-parser";

// Regex for matching variable names within a property value
const varNameRegex = /@[\w-_]+/gm;
const parseColor = require('parse-color');

export class CssUtil {

    /**
     * Returns a boolean indicating whether two Css properties are equal or not. **This does not work with shorthand properties.**
     * 
     * For supported properties, this comparison will be made using a custom comparator to account for different.
     * 
     * For unsupported properties, the comparison will be made simply using ==
     * 
     * @param prop The property being compared
     * @param value1 The first value 
     * @param value2 The second value
     */
    static CompareCssProperty(prop:string, value1:any, value2:any): boolean {
        if(prop.includes('color')){
            // Handle color comparisons by converting them both to RGBA
            let color1 = parseColor(value1).rgba;
            let color2 = parseColor(value2).rgba;

            // If one of the values is transparent, just check if the other one has the alpha channel set to 0
            if(value1 === 'transparent' || value2 === 'transparent'){
                return (color1 && color1[3] === 0) || (color2 && color2[3] === 0);
            }

            // Compare colors
            if(color1 && color2){
                for(let i = 0; i < color1.length; i++){
                    // If one of the channels doesn't match, the colors are different
                    if(color1[i] !== color2[i]) { 
                        return false; 
                    }
                }
                return true;
            }
        }

        // For unsupported properties, simply compare their regular values.
        // tslint:disable-next-line: triple-equals (intentional use of type conversion)
        return value1 == value2;
    }

    /**
     * Returns a new CssProperties objects with all shorthand properties expanded
     * @param props 
     */
    static ExpandProperties(props: CssProperties): CssProperties {
        let newProps: CssProperties = {};
        for(let prop in props){
            // Expands shorthand props. If a prop isn't shorthand, expandShorthandProperty will return it as is.
            newProps = {...newProps, ...cssprop.expandShorthandProperty(prop, props[prop])};
        }
        return newProps;
    }

    /**
     * Returns the type of color used in the string
     * @param color 
     */
    static GetRGBAColor(color: string): string{
        if(color.startsWith('rgba(')){ return 'rgba'; }

        // Other conversions
        if(color.startsWith('#')){ return 'hex'; }
        if(color.startsWith('rgb(')){ return 'rgb'; }
        if(color.startsWith('hsl(')){ return 'hsl'; }
        if(color.startsWith('hsla(')){ return 'hsla'; }

        // If all else fails, treat it as a keyword
        return 'keyword';
    }

    /**
     * Given a string s, this method will return an array of LESS variable names in it (without the 'at').
     * If no variables exist, the array will be empty.
     * @param value
     */
    static GetVariablesInString(value: string): string[]{
        let vars: string[] = [];
        let matches = value.match(varNameRegex);
        if(matches){
            matches.forEach(match => {
                vars.push(match.replace('@', ''));
            });
        }
        return vars;
    }

	static extractToken(lineNumber: number) {
		let editor = vscode.window.activeTextEditor;
		// Check if there is an open editor
		if (editor) {
			// Prepare return variables
			let type: string = ''; // Type of the line
			let propValue: string[] = []; // If it's a variable or property, it will be added here
			let selector: string = ''; // If it's a selector, it will be added here
			let parents: string[] = []; // Parents for the property or selector

			// Get line content
			let line = CurrentFileUtil.getLine(editor, lineNumber);
			let lineText = line.text;
			// TODO Handle multiple lines. E.g. Check whether line ends with a comma. If so, include all lines until we find either a ; (end of rule) or  { (end of selector)

			// Very simple rules for detecting what kind of content is being edited (e.g. rules, tokens, etc.)
			// TODO make this whole thing more robust. This is mainly a proof of concept at this point.
			if (lineText.trim()[0] === '@' && !lineText.includes('{')) { // variable
				type = 'variable';
				propValue = CssUtil.getRule(lineText);

			} else if (lineText.match(/(.+\:\s*.+\;)/)) { // Rule
				type = 'rule';
				propValue = CssUtil.getRule(lineText);

			} else if (lineText.includes('{')) { // Selector
				type = 'selector';
				selector = CssUtil.getSelector(lineText);
			}
			parents = CssUtil.findParentSelectors(lineNumber, editor);

			// Return object
			return {
				type: type,
				properties: propValue,
				selector: selector,
				parents: parents
			};
		}

	}

	static findParentSelectors(lineNumber: number, editor: vscode.TextEditor): string[] {
		let foreignScope: number = 0;
		let currLineNumber: number = lineNumber; // Start search one line above current line
		let currLine: vscode.TextLine = CurrentFileUtil.getLine(editor, currLineNumber);
		let parents: string[] = [];

		// Loop while the character is not in the line and there are still lines
		do {
			// Decrement counter and get character
			currLineNumber = currLineNumber - 1;
			currLine = CurrentFileUtil.getLine(editor, currLineNumber);

			// Check if current line starts or ends a scope
			if (currLine.text.includes('{') && !currLine.text.includes('}')) { // Opening scope
				if (foreignScope === 0) { // There are no foreig scopes
					parents.push(CssUtil.getSelector(currLine.text));
				} else {
					// Pop the foreign scope
					foreignScope--;
				}
			} else if (currLine.text.includes('}') && !currLine.text.includes('{')) { // Closing scope
				// Found the end of a scope, which means this is not a parent of the current line. Disable the includeScope var.
				foreignScope++;
			}
		} while (currLineNumber > 0);

		// Return array of parents
		return parents;
	}

	static getSelector(lineText: string) {
		return lineText.replace('{', '').trim();
	}

	static getRule(rule: string) {
		let split = rule.split(':');
		return [split[0].trim(), split[1].trim().replace(';', '')];
	}


}