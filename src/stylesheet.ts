import * as vscode from 'vscode';
import * as postcss from 'postcss';
import * as path from 'path';
import { LinksMap, LayerSelectorLink } from './link';
import { start } from 'repl';

// Type of css properties
export type CssProperties = {[prop:string]: string};

// Rules that count as global scope
const globalRules = ['body', 'html', '*', ':root'];
// Empty plugin to disable postcss warning message
const noopPlugin = postcss.plugin('postcss-noop', () => {
    return async () => {}; 
});

export class Stylesheet {
    // Properties
    text: string;
    baseScope: StylesheetScope;
    version: number;
    decorations: vscode.TextEditorDecorationType[];
    links: LinksMap;
    private parsePromise?: postcss.LazyResult = undefined;
    private parsedCallbacks: Function[] = [];

    /**
     * 
     * @param editor Current editor
     */
    constructor(
        private editor: vscode.TextEditor,
        private diagnostics: vscode.DiagnosticCollection
    ){
        this.text = this.editor.document.getText();
        this.baseScope = new StylesheetScope('body');
        this.version = this.editor.document.version;
        this.decorations = [];
        this.links = {};
        
        // Parse the file
        this.parseFile();
    }

    /**
     * Parses a less file to map variables, selectors, and properties.
     * 
     * This uses postcss with a less syntax.
     */
    private parseFile(){
        const syntax = require('postcss-less');
        this.parsePromise = postcss([noopPlugin]).process(this.text, { syntax: syntax, from: undefined });
        this.parsePromise.then(result => {
            if(result && result.root && result.root.nodes){
                // Create the scopes
                this.createStyleSheetScopes(result.root.nodes, this.baseScope);
                // Run parsed callbacks
                this.runCallbacks();
            }
        });
    }

    /**
     * Runs the callback functions for when the file is parsed
     */
    private runCallbacks(){
        this.parsedCallbacks.forEach((fn)=>{
            fn();
        });
        this.parsePromise = undefined;
        this.parsedCallbacks = [];
    }

    /**
     * Adds a function to be ran after the file has been parsed.
     * If there is no parsing pending, the function will be ran immediatelly.
     * @param fn 
     */
    addParsedFileCallback(fn: Function){
        if(!this.parsePromise){
            // THere is no pending parsing. Just run the function
            fn();
        } else {
            this.parsedCallbacks.push(fn);
        }
    }

    /**
     * 
     * @param nodes 
     * @param scope 
     */
    private createStyleSheetScopes(nodes: postcss.ChildNode[] | undefined, scope: StylesheetScope){
        if(!nodes){ // If no nodes are present, don't do anything
            return;
        }

        // For each node, check their type and execute the appropriate action
        nodes.forEach(node => {
            // Calculate the editor range for the current node
            let range = this.calculateRange(node);

            // Process each kind of css token
            if(node.type === 'atrule' && (node as any).variable){ 
                // VARIABLE
                // Add the variable to the current scope
                let variableNode = node as any; // Using any so we can use less syntax properties
                scope.variables[variableNode.name] = variableNode.value;
                scope.addRange(variableNode.name, range);
            
            } else if(node.type === 'decl'){ 
                // PROPERTY
                // Add the property to the current scope
                scope.addProperty(node.prop, node.value);
                scope.addRange(node.prop, range);

            } else if(node.type === 'rule'){ 
                // RULE (SELECTOR)
                let selector = node.selector;
                let newScope = scope;

                // Create a new scope if this is not the global scope
                if(!globalRules.includes(selector)){
                    // Create the new scope
                    newScope = new StylesheetScope(selector, scope);     
                    // Add the new scope to its parent's children
                    scope.children.push(newScope);
                    // Add the selector to the range mapping
                    newScope.addRange(selector, range);
                } else {
                    // This is the base scope. Add it's range
                    scope.addRange(selector, range);
                }
                
                // If this node has children, process them
                this.createStyleSheetScopes(node.nodes, newScope);  
            }
        });
    }

    /**
     * Updates the links in the stylesheet file
     * @param links 
     */
    updateLinks(links: LinksMap){
        // First, dispose of the current decorations and diagnostic messages
        this.clear();        
        this.diagnostics.delete(this.editor.document.uri);
        
        // Then, add the links and generate diagnostic messages
        let warnings: vscode.Diagnostic[] = [];
        this.links = links;
        for(let scopeId in this.links){
            let links = this.links[scopeId];
            links.forEach(link => {
                console.log('Update link');
                console.log(link);
                console.log('\n');
                let scope = this.getScope(link.scopeId);
                if(scope){
                    // Add decoration to selector
                    this.addCodeDecoration(link, scope);
                    // Find differing properties and add warnings
                    let different = scope.diffIntersectingCssProperties(link.layer.styles);
                    warnings.push(...this.getWarnings(scope, different));
                }
            });
        }

        // Add the warning messages
        this.diagnostics.set(this.editor.document.uri, warnings);
    }

    /**
     * Generates editor warning messages for properties within a scope
     * @param scope 
     * @param different 
     */
    getWarnings(scope: StylesheetScope, different: string[]): vscode.Diagnostic[] {
        let warnings: vscode.Diagnostic[] = [];
        different.forEach(diff => {
            let message = `Mismatch with Figma design. Expected ${diff}:XXX;`;
            warnings.push(new vscode.Diagnostic(scope.ranges[diff], message, vscode.DiagnosticSeverity.Warning));
        });
        return warnings;        
    }

    /**
	 * 
	 * @param layer 
	 */
	private addCodeDecoration(link: LayerSelectorLink, scope: StylesheetScope){
		let editor = this.editor;
		if(editor){
			// Create range object
            let range = scope.ranges[scope.selector];

			// Create layer path for hover information
            let layerPath = link.layerPath;
			let hoverMessageMarkdown = new vscode.MarkdownString(
				`**Linked Figma layer** \n` + 
				layerPath.map((val, i) => {
                    // Create markdown for layer item
                    let isActualLayer = (i+1 === layerPath.length);
                    let args = JSON.stringify([{layerId: link.layerId}]);
                    let layerName = isActualLayer ? `* [${val}](command:figmasync.revealLayer?${encodeURIComponent(args)} "Open layer in sidebar")` : `* ${val}`;
                    let indentation = '\t'.repeat(i);
                    return indentation + layerName + '\n';
                }).join('\n')
            );
            // Enable links in the markdown string
            hoverMessageMarkdown.isTrusted = true;

			// Create decoration
			const options: vscode.DecorationOptions[] = [{ range: range, hoverMessage: hoverMessageMarkdown}];
            const decorationType = this.getLinkedSelectorDecoration();
            
            // Store decoration
            this.decorations.push(decorationType);
            
            // Add them to the editor
			editor.setDecorations(decorationType, options);
		}
    }

    /**
	 * Gets the code decoration style for selectors linked with a Figma layer
	 */
	private getLinkedSelectorDecoration(): vscode.TextEditorDecorationType {
		return vscode.window.createTextEditorDecorationType({
			// borderWidth: '0 0 0 1px',
			// borderStyle: 'solid',
            // borderColor: '#7C62FF',
            backgroundColor: '#312C4B',
            color: '#A28FFF',
			isWholeLine: false,
			overviewRulerColor: '#7C62FF',
			overviewRulerLane: vscode.OverviewRulerLane.Left,
			fontWeight: 'bolder',
		});
    }
    
    /**
     * Removes all decorations currently in place
     */
    clear() {
        // Remove decorations
        this.decorations.forEach(d => {
            d.dispose();
        });
    }

    /**
     * Gets a scope by it's full css selector
     * TODO implement a scope map for faster access
     * @param selector full css selector, starting from root scope
     */
    getScope(selector: string): StylesheetScope | undefined{
        let scope = this._getScope(selector, this.baseScope);
        return scope;
    }

    /**
     * Returns an array of strings with all full css selectors within the base scope
     */
    getAllSelectors(): string[] {
        return this.baseScope.getAllSelectorsList();
    }

    /**
     * Gets a scope based on the full css selector
     * 
     * @param selector 
     * @param scope 
     */
    private _getScope(selector: string, scope: StylesheetScope): StylesheetScope | undefined {
        // Check if this scope is the desired one
        if(scope.cssScopeName === selector){
            return scope;
        }
        // This is not the right scope. Look at it's children;
        for(let i = 0; i < scope.children.length; i++) {
            let childScope = scope.children[i];
            let result = this._getScope(selector, childScope);
            if(result){
                return result;
            }
        }
        
        // Didn't find anything.
        return undefined;
    }

    /**
     * Based on the start position and token type, this method looks for the 
     * end character of the token and returns its position. If there is no end, returns undefined.
     * @param node 
     */
    private calculateRange(node: postcss.ChildNode): vscode.Range | undefined {    
        if(node.source && node.source.start && node.source.end){
            let startPosition = new vscode.Position(node.source.start.line-1, node.source.start.column-1);
            let endPosition = new vscode.Position(node.source.end.line-1, node.source.end.column-1);

            // If this is not a rule, use the range given by postcss
            if(node.type !== 'rule'){
                return new vscode.Range(startPosition, endPosition);
            }
            
            // Otherwise, we have to search for it since postcss's range goes all the way to the end of the block.
            let targetChar = '{';
            let lineNumber = startPosition.line;
            let colNumber = startPosition.character;
            let nonWSColNumber = colNumber; // Keeps track of the latest non whitepsace character in the line
            do {
                let lineText = this.editor.document.lineAt(lineNumber).text;
                // Search within the line
                while(colNumber < lineText.length){
                    // Check if character is the correct one
                    if(lineText[colNumber] === targetChar){
                        // Found the character. Return the position
                        endPosition = new vscode.Position(lineNumber, nonWSColNumber);
                        return new vscode.Range(startPosition, endPosition);
                    }
                    // Update non whitespace column number
                    if(/\s/.test(lineText[colNumber])){
                        nonWSColNumber = colNumber;
                    }
                    // Increment column number
                    colNumber++;
                }
            
                // Line ended and still haven't found it. Look in the next line.
                lineNumber++;
                colNumber = 0;
            } while(lineNumber < this.editor.document.lineCount);
        }
        return undefined;
    }
}


/**
 * This class represents a scope (properties within a selector) in a less/css file.
 */
export class StylesheetScope {
    variables: CssProperties;
    children: StylesheetScope[];
    ranges: {[key:string]: vscode.Range};
    styles: CssProperties;

    /**
     * 
     * @param selector 
     * @param parent 
     */
    constructor(
        public selector: string,
        public parent?: StylesheetScope,
    ){
        this.styles = {};
        this.variables = {};
        this.children = [];
        this.ranges = {};
    }

    /**
     * Resolves any '&' characters to their parent's resolved scope name
     */
    get resolvedScopeName(): string {
        if(this.selector.includes('&') && this.parent){
            // Get parent resolved selector
            let parentSelector = this.parent.resolvedScopeName;
            return this.selector.replace('&', parentSelector);
        }
        return this.selector;
    }

    /**
     * Resolves the scope chain name into a CSS (not LESS) selector
     * 
     * e.g.
     * 
     *      .button { &:hover { ... } } -> .button:hover
     */
    get cssScopeName(): string {
        if(this.selector.includes('&') && this.parent){
            // Scope has parent and has & selector. Replace & with parent's css selector
            let parentSelector = this.parent.cssScopeName;
            return this.selector.replace('&', parentSelector);
        } else if (this.parent){
            // Selector has parent but no &. Just prepend parent selector
            return `${this.parent.cssScopeName} ${this.selector}`;
        }
        // It doesn't have a parent. Just return it.
        return this.selector;
    }

    /**
     * Returns a list of all css selectors within this scope (starting with itself)
     */
    getAllSelectorsList(): string[] {
        let list = [this.cssScopeName];
        this.children.forEach(child => {
            list.push(...child.getAllSelectorsList());
        });
        return list;
    }

    /**
     * 
     * @param variable 
     */
    resolveVariable(variable:string): string{
        // First look in the current scope
        if(variable in this.variables){
            return this.variables[variable];
        } 
        // If not in curent scope, recursively look at parents
        if(this.parent){
            return this.parent.resolveVariable(variable);
        }
        // If nothing, return the original value
        return variable;
    }

    /**
     * 
     * @param prop 
     * @param value 
     */
    addProperty(prop:string, value:string){
        let finalValue = value;
        if(value[0] === '@'){
            // this is a variable. Resolve it.
            finalValue = this.resolveVariable(value.substring(1));
        }
        this.styles[prop] = finalValue;
    }

    /**
     * Adds a mapping of document ranges for each part of the scope (variables, props, selector, etc.)
     * @param node 
     * @param range
     */
    addRange(key: string, range?: vscode.Range){
        if(range){
            this.ranges[key] = range;
        }
    }

    /**
     * This method compares two CssProperties objects and returns those that differ between them.
     * Only properties that exist in both CssProperties instances will be considered.
     * @param props1 
     * @param otherProps 
     */
    diffIntersectingCssProperties(otherProps: CssProperties): string[]{
        let thisProps = this.styles; 
        let different: string[] = [];
        for(let prop in thisProps){
            if(prop in otherProps){
                // Found an intersecting property. Compare their values
                if(thisProps[prop] !== otherProps[prop]){
                    different.push(prop);
                }
            }
        }
        return different;
    }
}