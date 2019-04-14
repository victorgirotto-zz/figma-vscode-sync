import * as vscode from "vscode";
import { CurrentFileUtil } from "./current-file-util";

export class CssUtil {

    static extractToken(lineNumber: number){
		let editor = vscode.window.activeTextEditor;
		// Check if there is an open editor
		if(editor){
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
			if(lineText.trim()[0] === '@' && !lineText.includes('{')){ // variable
				type = 'variable';
				propValue = CssUtil.getRule(lineText);
				
			} else if (lineText.match(/(.+\:\s*.+\;)/)){ // Rule
				type = 'rule';
				propValue = CssUtil.getRule(lineText);			

			} else if (lineText.includes('{')){ // Selector
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
	
	static findParentSelectors(lineNumber: number, editor: vscode.TextEditor): string[]{
		let foreignScope: number = 0; 
		let currLineNumber: number = lineNumber; // Start search one line above current line
		let currLine: vscode.TextLine = CurrentFileUtil.getLine(editor, currLineNumber);
		let parents: string[] = [];

		// Loop while the character is not in the line and there are still lines
		do  {
			// Decrement counter and get character
			currLineNumber = currLineNumber - 1;
			currLine = CurrentFileUtil.getLine(editor, currLineNumber);

			// Check if current line starts or ends a scope
			if (currLine.text.includes('{') && !currLine.text.includes('}')){ // Opening scope
				if(foreignScope === 0){ // There are no foreig scopes
					parents.push(CssUtil.getSelector(currLine.text));
				} else {
					// Pop the foreign scope
					foreignScope--;
				}
			} else if (currLine.text.includes('}') && !currLine.text.includes('{')) { // Closing scope
				// Found the end of a scope, which means this is not a parent of the current line. Disable the includeScope var.
				foreignScope++;
			}
		} while(currLineNumber > 0);

		// Return array of parents
		return parents;
	}

	static getSelector(lineText: string){
		return lineText.replace('{','').trim();
	}

	static getRule(rule:string){
		let split = rule.split(':');
		return [split[0].trim(), split[1].trim().replace(';', '')];
	}


}