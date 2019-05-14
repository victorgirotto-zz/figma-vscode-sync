import * as vscode from 'vscode';
import * as Figma from 'figma-js';
import { DataStorage } from './storage';
import { Stylesheet, StylesheetScope, CssProperties } from './stylesheet';
import { FigmaFile } from './figmafile';
import { FigmaLayerProvider, FigmaLayer, CssPropertiesProvider, LinksManagerProvider } from './sidebar';
import { LayerSelectorLink, LinksMap, IdOrder } from './link';

export const supportedLanguages = ['less']; // List of supported file types
const APIKeyConfigName = 'APIKey';
const ignoreInternalLayersConfigName = 'IgnoreInternalLayers';

enum Status {
    SYNCING, // Waiting for data from Figma
    SYNCED, // Synced with Figma and ready
    NOT_ATTACHED, // Supported file, but not attached 
    UNSUPPORTED, // Unsupported file
    ERROR // Somethign went wrong
}

/**
 * Represents and manipulates everything related to the state of the currently open workspace
 */
export class WorkspaceState {
    static statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left);

    // VSCode properties
    private context: vscode.ExtensionContext;
    private config: vscode.WorkspaceConfiguration;
    private diagnostics: vscode.DiagnosticCollection;
    private files: vscode.Uri[];
    private stylesheets: {[uri: string]: Stylesheet};
    
    // Persisted properties API
    private storage!: DataStorage; // for persisting and retrieving data
    
    // View managers
	private stylesheet!: Stylesheet; // Represents the style scopes in the current file
    private sidebarProvider!: FigmaLayerProvider; // Represents and manipulates all FigmaLayer instances
    private treeView!: vscode.TreeView<FigmaLayer>;

	/**
	 * 
	 * @param editor Currently open editor
	 * @param context extension context
	 */
	constructor(context: vscode.ExtensionContext, diagnostics: vscode.DiagnosticCollection){
        // Set vscode properties
        this.context = context;
        this.diagnostics = diagnostics;
        this.config = vscode.workspace.getConfiguration();
        this.files = [];
        this.stylesheets = {};

        // Get list of files and begin tracking them
        vscode.workspace.findFiles(`**/*.{${supportedLanguages.join(',')}}`).then((fileURIs) => {
            fileURIs.forEach(file => {
                this.trackFile(file);
            });
        });

        // Load from storage
        this.load();
    }

    /**
     * Based on the vscode properties, loads data from storage and sets up the views
     */
    load() {
        // Load persisted data
		this.storage = new DataStorage(this.context);
        
        // Set initial view states
        this.status = this.getDefaultStatus();
        this.loadSidebar();
        this.loadStyleSheetView();
        this.createCssPropertiesProvider();
        // this.createLinksManagerProvider();
    }

    /**
     * Removes any lingering elements from the screen
     */
    dispose(){
        // Remove decorations
        this.stylesheet.clear();
    }

    /**
     * Updates the state when the text editor changes
     */
    handleEditorChange(){
        // Parse the new file
        this.loadStyleSheetView();
    }
    
    /**
     * Begins tracking a supported file. To do that, it adds the file URI to a list of tracked files, 
     * and also parses it and stores its parsed object in memory.
     * @param fileURI URI of the file to be tracked
     */
    trackFile(fileURI: vscode.Uri){
        // Add to list of files
        this.files.push(fileURI);
        // Parse and store it
        vscode.workspace.openTextDocument(fileURI).then(document => {
            // let stylesheet = new Stylesheet(fileURI, this.diagnostics);
            // this.stylesheets[fileURI.fsPath] = stylesheet;
        });
    }


    /*==========
        LINKS
    ============*/

    /**
     * Returns a list of all link IDs
     */
    get linksIds(): string[][] {
        return this.storage.links;
    }

    /**
     * Returns an array representing all existing links between figma layers and selectors
     */
    get links(): LayerSelectorLink[] {
        let linkIds = this.linksIds;
        let links = linkIds.reduce((acc, ids) => {
            let layer = this.getLayerById(ids[IdOrder.Layer]);
            let scope = this.getScopeByFullSelector(ids[IdOrder.Scope]);
            if(scope && layer){
                acc.push(new LayerSelectorLink(this.currentFilePath, layer, scope));
            }
            return acc;
        }, [] as LayerSelectorLink[]);
        return links;
    }

    /**
     * Returns a set of all existing links indexed by the layer id
     */
    get linksByLayer(): LinksMap {
        return this._getLinksBy(IdOrder.Layer);
    }
    
    /**
     * Returns a set of all existing links indexed by the layer id
     */
    get linksBySelector(): LinksMap {
        return this._getLinksBy(IdOrder.Scope);
    }

    /**
     * Returns a boolean stating whether this layer is linked or not
     * @param layer 
     */
    isLayerLinked(layer: FigmaLayer): boolean{
        let links = this.linksByLayer;
        if(layer.id in links){
            return true;
        }
        return false;
    }

    /**
     * Gets a map of links by either the scope or layer ID
     * @param type index of the desired mapping (from the IdOrder enum)
     */
    private _getLinksBy(type: IdOrder): LinksMap{
        let links = this.storage.links;
        let linksMap = links.reduce((acc, ids) => {
            // Retrieve both
            let layer = this.getLayerById(ids[IdOrder.Layer]);
            let scope = this.getScopeByFullSelector(ids[IdOrder.Scope]);
            let key = ids[type];
            // If both found, add to object
            if(layer && scope){
                let linksArray = acc[key];
                if(!linksArray){
                    // If this is the first link for this layer, create the array
                    linksArray = [];
                }
                // Add to array and to acc object
                linksArray.push(new LayerSelectorLink(this.currentFilePath, layer, scope));
                acc[key] = linksArray;
            }
            return acc;
        }, {} as LinksMap);
        return linksMap;
    }
    
    /**
     * Adds or replaces a link between a layer and a css scope.
     * 
     * This will cause views to update accordingly 
     * @param layer 
     * @param scope 
     */
    addLink(layer: FigmaLayer, scope: StylesheetScope) {
        console.log(this.currentFilePath);
        // Create link
        let link = new LayerSelectorLink(this.currentFilePath, layer, scope);
        // Persist it
        // this.storage.addLink(link.ids);
        // Update views
        // this.updateViewsWithLinks();
    }

    /**
     * Removes the link for a given layer
     * @param layer 
     */
    removeLayerLink(layer: FigmaLayer){
        this.storage.removeLayerLinks(layer);
        // Update views
        this.updateViewsWithLinks();
    }
    
    /**
     * Updates the views with the current links
     */
    updateViewsWithLinks(){
        // TODO
        // Update links manager view
        // this.createLinksManagerProvider(this.links);
        
        // // Update links in views
        // this.figmaLayerProvider.updateLinks(this.linksByLayer);
        // this.stylesheet.updateLinks(this.linksBySelector);
    }

    /**
     * Creates the provider for the links manager view
     * @param links 
     */
    createLinksManagerProvider(links?: LayerSelectorLink[]){
        vscode.window.createTreeView('linksManager', {
            treeDataProvider: new LinksManagerProvider(links),
            showCollapseAll: true
        });
    }


    /*===============
        STYLESHEET
    ================*/

    /**
     * Parses all stylesheets in the workspace and keeps them in memory
     */
    parseStyleSheets(){
        // TODO
    }
    

    /**
     * Loads the view based on the current file
     */
    loadStyleSheetView(){

        // Only load for supported file types
        if(this.editor && supportedLanguages.includes(this.editor.document.languageId)){
            // Instantiate view the stylesheet view manager
            this.stylesheet = new Stylesheet(this.editor, this.diagnostics);
            // Wait for the file parsing to end before continuing with loading
            this.stylesheet.addParsedFileCallback(()=>{
                // Load links
                this.updateViewsWithLinks();
            });
        }
    }

    /**
     * Returns all available selectors
     */
    get selectors(): string[] {
        return this.stylesheet.getAllSelectors();
    }

    /**
     * 
     * @param fullSelector 
     */
	getScopeByFullSelector(fullSelector: string) {
		return this.stylesheet.getScope(fullSelector);
    }
    
    /**
     * Highlights a scope in the editor
     * @param scopeName 
     */
    highlightScopeByName(scopeName: string){
        let scope = this.stylesheet.getScope(scopeName);
        let editor = this.editor;
        if(scope && editor){
            let scopeRange = scope.getSelectorRange();
            editor.revealRange(scopeRange, vscode.TextEditorRevealType.InCenterIfOutsideViewport);
            editor.selection = new vscode.Selection(scopeRange.start, scopeRange.end);
        }
    }


    /*=====================================
        FIGMA FILE, COMPONENTS & SIDEBAR
    =======================================*/

    /**
     * Fetches all currently connected figma files from the server
     */
    public fetchAllFigmaFiles(): boolean {
        let keys = this.fileKeys;
        let ok = true;
        keys.forEach(key => {
            ok = ok && this.fetchFigmaFile(key);
        });
        return ok;
    }

    /**
     * Fetches a figma file and builds its FigmaFile cache
     */
    public fetchFigmaFile(fileKey: string): boolean{
        if(this.isDocumentSetup){
            // Set status
            this.status = Status.SYNCING;
            const client = Figma.Client({ personalAccessToken: this.APIKey });
            client.file(fileKey).then(({ data }) => {
                // Retrieve cache if any
                let figmaFile = this.getFigmaFile(fileKey);

                // Check if the there is data and if it's is up to date. If not, parse received data.
                if(!figmaFile || data.lastModified !== figmaFile.lastModified){
                    // Store components
                    this.addFigmaFile(new FigmaFile(data, fileKey));
                }
                // Change status
                this.status = Status.SYNCED;

            }).catch(reason => {
                this.status = Status.ERROR;
                console.warn(reason);
                throw new Error('Something went wrong while fetching the data...');
            });

            // Request successfully submited
            return true;
        }

        // File not set up. 
        return false;
    }

    /**
     * Returns all cached figmaFile instances
     */
    get figmaFiles(): FigmaFile[] {
        return this.storage.retrieveAllFigmaFiles();
    }

    /**
     * Adds a FigmaFile instance to the workspace state
     * @param figmaFile 
     */
    addFigmaFile(figmaFile: FigmaFile){
        this.storage.cacheFigmaFile(figmaFile);

        // Update treeview provider
        this.loadSidebar();
    }

    /**
     * Returns the file FigmaFile instance for the fileKey
     * @param fileKey 
     */
    getFigmaFile(fileKey: string): FigmaFile {
        return this.storage.retrieveFigmaFile(fileKey);
    }

    /**
     * Updates the treeview with the current figma components
     */
    loadSidebar(){
        let provider = new FigmaLayerProvider(this.figmaFiles, this.ignoreInternalLayers);
        // Update internal representation
        this.sidebarProvider = provider;
        // Register the provider
        this.treeView = vscode.window.createTreeView('figmaComponents', {
            treeDataProvider: this.sidebarProvider,
            showCollapseAll: true
        });
    }

    /**
     * Reveals a layer in the sidebar by its ID
     * @param layerId 
     */
    revealLayerById(layerId: string){
        let figmaLayer = this.sidebarProvider.treeItems[layerId];
        if(figmaLayer){
            this.treeView.reveal(figmaLayer, {
                select: true,
                focus: false
            }).then(()=>{
                this.showCssProperties(figmaLayer);
            });
        }
    }

    /**
     * Returns a layer object by its ID
     * @param layerId 
     */
    getLayerById(layerId: string): FigmaLayer | undefined{
        let items = this.sidebarProvider.treeItems;
        if(layerId in items){
            return items[layerId];
        }
        return undefined;
    }

    /**
     * Displays the CSS properties for a layer in the Sidebar CSS Properties view
     * @param layer 
     */
    showCssProperties(layer: FigmaLayer){
        // PROBABLY REMOVE I'm not sure showing and hiding things is the best UX
        // Set context variable to show or hide the view
        // let selectedStyledItem = layer.hasStyles ? true : false;
        // vscode.commands.executeCommand("setContext", "selectedStyledItem", selectedStyledItem);
        
        // Create provider 
        this.createCssPropertiesProvider(layer.styles);
    }

    /**
     * Creates a the provider for the css properties view
     * @param styles
     */
    createCssPropertiesProvider(styles?: CssProperties){
        vscode.window.createTreeView('layerProperties', {
            treeDataProvider: new CssPropertiesProvider(styles)
        });
    }




    /*====================================
        FILE & EXTENSION SETUP, CONFIGs
    ======================================*/

    get editor(): vscode.TextEditor | undefined {
        return vscode.window.activeTextEditor;
    }

    get currentFilePath(): string {
        if(this.editor){
            return this.editor.document.uri.fsPath;
        }
        return '';
    }

    /**
     * Returns the filekey associated with this document
     */
    get fileKeys(): string[] {
        return this.storage.fileKeys;
    }

    /**
     * Returns the API key currently set in the configuration
     */
    get APIKey(): string | undefined {
        return this.config.get(APIKeyConfigName);
    }

    /**
     * Checks whether the document is setup to sync with a figma document
     */
    get isDocumentSetup(): boolean {
        return this.fileKeys.length > 0 && this.APIKey !== undefined;
    }

    /**
     * Returns a boolean indicating whether internal layers should be ignored. Defaults to true.
     */
    get ignoreInternalLayers(): boolean {
        let ignore = this.config.get<boolean>(ignoreInternalLayersConfigName);
        return ignore ? ignore : false;
    }

    /**
     * Connects this workspace with a figma file
     */
    public connectFigmaFileKey(fileKey:string){
        // Persist this connection
        this.storage.addFileKey(fileKey);
        // Retrieve components
        this.fetchFigmaFile(fileKey);
    }

    /**
     * Deletes the data related to the figma file identified by fileKey
     * @param fileKey key of the Figma file
     */
    public unlinkFigmaFile(fileKey: string){
        // Delete data
        this.storage.removeFile(fileKey);
        // Reload the views
        this.load();
    }

    /**
     * Sets the status of the extension. This will be reflected in the status bar
     */
    set status(status: Status){
        // Create boilerplate function for showing the status bar with a message and command
        let showStatusBar = (text:string, command?:string) => {
            if(command){
                WorkspaceState.statusBar.command = command;
            }
            WorkspaceState.statusBar.text = text;
            WorkspaceState.statusBar.show();
        };

        switch(status){
            case Status.NOT_ATTACHED:
                showStatusBar(`$(circle-slash) Not connected to Figma`, 'figmasync.syncLessFile');
                break;
            case Status.SYNCING:
                showStatusBar('$(repo-sync) Syncing with api.figma.com');
                break;
                case Status.SYNCED:
                showStatusBar(`$(check) Synced with Figma`, 'figmasync.refreshComponents');
                break;
            case Status.ERROR:
                showStatusBar(`$(alert) Something went wrong...`, 'figmasync.syncLessFile');
            default:
                WorkspaceState.statusBar.hide();
        }
    }
    
    /**
     * Returns a suggested status based on the current state of persistent components and language ID
     */
    getDefaultStatus(): Status {
        if(this.isDocumentSetup) {
            return Status.SYNCED;
        }
        return Status.NOT_ATTACHED;
    }

}