import * as vscode from 'vscode';
import * as Figma from 'figma-js';
import { DataStorage } from './storage';
import { Stylesheet, CssProperties } from './stylesheet';
import { FigmaFile } from './figmafile';
import { FigmaLayerProvider, FigmaLayer, CssPropertiesProvider } from './sidebar';

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
    
    // Persisted properties API
    private storage!: DataStorage; // for persisting and retrieving data
    
    // View managers
    private stylesheets: {[uri: string]: Stylesheet};
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
        this.stylesheets = {};

        // Get list of files and begin tracking them
        vscode.workspace.findFiles(`**/*.{${supportedLanguages.join(',')}}`).then((fileURIs) => {
            this.trackFiles(fileURIs);
        });

        // Load from storage
        this.loadFromStorage();
    }

    /**
     * Based on the vscode properties, loads data from storage and sets up the views
     */
    loadFromStorage() {
        // Load persisted data
		this.storage = new DataStorage(this.context);
        
        // Set initial view states
        this.status = this.getDefaultStatus();
        this.loadSidebar();
        this.createCssPropertiesProvider();
    }
    
    /**
     * Begins tracking a list of supported files. A map of tracked files is kept in the stylesheets property in this class.
     * @param fileURI URI of the file to be tracked
     */
    trackFiles(fileUris: vscode.Uri[]){
        // Parse and store it
        fileUris.forEach(uri => {
            vscode.workspace.openTextDocument(uri).then(document => {
                let stylesheet = new Stylesheet(document);
                this.stylesheets[uri.fsPath] = stylesheet;
            });
        });
    }


    /*===============
        STYLESHEET
    ================*/

    /**
     * Returns the Stylesheet instance for the currently open stylesheet
     */
    get currentStylesheet(): Stylesheet | undefined {
        if(this.editor){
            let filePath = this.editor.document.uri.fsPath;
            if(filePath in this.stylesheets){
                return this.stylesheets[filePath];
            }
        }
    }

    /**
     * Returns all available selectors for the currently open file
     */
    get selectors(): string[] | undefined {
        if(this.currentStylesheet){
            return this.currentStylesheet.getAllSelectors();
        }
    }

    /**
     * 
     * @param fullSelector 
     */
	getScopeByFullSelector(fullSelector: string) {
        if(this.currentStylesheet){
            return this.currentStylesheet.getScope(fullSelector);
        }
    }
    
    /**
     * Highlights a scope in the editor
     * @param scopeName 
     */
    highlightScopeByName(scopeName: string){
        if(this.currentStylesheet){
            let scope = this.currentStylesheet.getScope(scopeName);
            let editor = this.editor;
            if(scope && editor){
                let scopeRange = scope.getSelectorRange();
                editor.revealRange(scopeRange, vscode.TextEditorRevealType.InCenterIfOutsideViewport);
                editor.selection = new vscode.Selection(scopeRange.start, scopeRange.end);
            }
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
        this.loadFromStorage();
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