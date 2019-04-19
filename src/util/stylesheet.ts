import * as vscode from 'vscode';
import * as postcss from 'postcss';
import * as path from 'path';
import { LinksMap, LayerSelectorLink } from '../link';

// Type of css properties
export type CssProperties = {[prop:string]: string};

// Rules that count as global scope
const globalRules = ['body', 'html', '*', ':root'];
// Empty plugin to disable postcss warning message
const noopPlugin = postcss.plugin('postcss-noop', () => {
    return async () => {}; 
});

export class Stylesheet {
    text: string;
    baseScope: StylesheetScope;
    version: number;
    decorations: vscode.TextEditorDecorationType[];

    constructor(
        private editor: vscode.TextEditor, 
        private links: LinksMap
    ){
        this.text = this.editor.document.getText();
        this.baseScope = new StylesheetScope('body');
        this.version = this.editor.document.version;
        this.decorations = [];
        
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
        postcss([noopPlugin]).process(this.text, { syntax: syntax, from: undefined }).then(result => {
            if(result && result.root && result.root.nodes){
                // Create the scopes
                this.createStyleSheetScopes(result.root.nodes, this.baseScope);
                // Add decorations for links
                this.updateLinks(this.links);
            }
        });
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
            if(node.type === 'atrule' && (node as any).variable){ // Processing a variable  
                // Add the variable to the current scope
                let variableNode = node as any; // TODO This could probably be improved. I'm not sure how to handle the additions postcss-less does to the node type
                scope.variables[variableNode] = variableNode.value;
            
            } else if(node.type === 'decl'){ // Processing a property
                // Add the property to the current scope
                scope.addProperty(node.prop, node.value);

            } else if(node.type === 'rule'){ // Processing a rule
                let selector = node.selector;
                let newScope = scope;
                let range = this.calculateRange(node);

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
                    let scope = this.getScope(selector);
                    if(scope){
                        scope.addRange(selector, range);
                    }
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
        // First, dispose of the current decorations
        this.clearDecorations();
        // Then, add the links
        this.links = links;
        for(let scopeId in this.links){
            let link = this.links[scopeId];
            let scope = this.getScope(link.scopeId);
            if(scope){
                this.addCodeDecoration(link, scope);
            }
        }
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
			borderWidth: '0 0 1px 0',
			borderStyle: 'solid',
            borderColor: '#7C62FF',
			isWholeLine: false,
			overviewRulerColor: '#7C62FF',
			overviewRulerLane: vscode.OverviewRulerLane.Left,
			gutterIconPath: path.join(__filename, '..', '..', '..', 'media', 'Sidebar', 'Active', 'component.svg'),
            gutterIconSize: 'auto',
			fontWeight: 'bolder',
		});
    }
    
    /**
     * Removes all decorations currently in place
     */
    clearDecorations() {
        this.decorations.forEach(d => {
            d.dispose();
        });
    }

    /**
     * 
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
     * @param type 
     * @param startRange 
     */
    private calculateRange(node: postcss.ChildNode): vscode.Range | undefined {    
        if(node.source && node.source.start){
            let startPosition = new vscode.Position(node.source.start.line-1, node.source.start.column-1);
    
            // Get target character based on the token type
            let targetChar = ((targetType:string) => {
                switch(targetType){
                    case 'rule':
                        return '{';
                    default:
                        return ';';
                }
            })(node.type);
    
            // // Search for it
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
                        let endPosition = new vscode.Position(lineNumber, nonWSColNumber);
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

    /**
     * This method compares two CssProperties objects and returns those that differ between them.
     * Only properties that exist in both CssProperties instances will be considered.
     * @param props1 
     * @param props2 
     */
    static diffIntersectingCssProperties(props1: CssProperties, props2: CssProperties): string[]{
        let different: string[] = [];
        for(let prop in props1){
            if(prop in props2){
                // Found an intersecting property. Compare their values
                if(props1[prop] !== props2[prop]){
                    different.push(prop);
                }
            }
        }
        return different;
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
     * @param scopeSelector 
     */
    findScope(scopeSelector: string){
        
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
}