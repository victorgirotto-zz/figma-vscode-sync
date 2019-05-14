import * as vscode from 'vscode';
import { FigmaFile } from './figmafile';
import { IdOrder } from './link';
import { FigmaLayer } from './sidebar';
import * as fs from 'fs';
import * as path from 'path';

const fileName = '.figmasync';

/**
 * API for persisting information related to Figma Sync
 * This class decides what is stored in the local file vs. workspace storage.
 */
export class DataStorage {
    context: vscode.ExtensionContext;
    filePath: string = '';
    fileStorage: FileStorage;

    constructor(context: vscode.ExtensionContext){
        this.context = context;
        
        // Create file storage
        let wsFolders = vscode.workspace.workspaceFolders;
        if(wsFolders){
            this.filePath = wsFolders[0].uri.fsPath;
        }
        this.fileStorage = new FileStorage(this.filePath);
    }

    /**
     * Persists a file key
     * @param key 
     */
    addFileKey(key: string){
        this.fileStorage.addFigmaFile(key);
    }

    /**
     * Retrieves the persisted file keys
     */
    get fileKeys(): string[]{
        return this.fileStorage.figmaFiles;
    }

    /**
     * Retrieves all persisted figma files
     */
    retrieveAllFigmaFiles(): FigmaFile[] {
        let keys = this.fileKeys;
        let figmaFiles: FigmaFile[] = [];
        keys.forEach(key => {
            let file = this.retrieveFigmaFile(key);
            if(file){
                figmaFiles.push(file);
            }
        });
        return figmaFiles;
    }

    /**
     * Persists a figma file instance under its filekey
     */
    cacheFigmaFile(figmaFile: FigmaFile){
        this.context.workspaceState.update(`figmaFile-${figmaFile.key}`, figmaFile);
    }


    /**
     * Retrieves a figmaFile instance under a fileKey
     */
    retrieveFigmaFile(fileKey: string): FigmaFile {
        return this.context.workspaceState.get(`figmaFile-${fileKey}`) as FigmaFile;
    }

    /**
     * Deletes the figmaFile cache for fileKey
     * @param fileKey 
     */
    deleteFigmaFileCache(fileKey: string) {
        this.context.workspaceState.update(`figmaFile-${fileKey}`, undefined);
    }

    /**
     * Adds a link between a layer and a css scope
     * @param layer 
     */
    addLink(linkIds: string[]){
        // Get current links
        let links = this.links;
        // Check if link already exists
        let linkExists = links.some((storedLinkIds) => {
            // Return true if both layer and scope ids are the same
            return storedLinkIds[IdOrder.Layer] === linkIds[IdOrder.Layer] && 
                storedLinkIds[IdOrder.Scope] === linkIds[IdOrder.Scope];
        });

        // If it doesn't, add the new link
        if(!linkExists){
            // Add the new link
            links.push(linkIds);
            // Update storage value
            // TODO
        }
    }

    /**
     * Removes the link for a given layer
     * @param layerId 
     */
    removeLayerLinks(layer: FigmaLayer){
        let links = this.links;
        // Filter out all links that belong to this layer
        links = links.filter((link) => {
            return link[IdOrder.Layer] !== layer.id;
        });
        // Update storage value with the filtered link array
        // TODO
    }

    /**
     * Returns the stored array of link ids
     */
    get links(): string[][] {
        // let links = this.context.workspaceState.get<string[][]>(`links-${this.uri}`);
        // if(links){
        //     return links;
        // }
        // else {
        //     return [];
        // }
        return [];
    }

    /**
     * Erases all figma sync cache data
     */
    removeFile(fileKey: string){
        // Remove cache
        this.context.workspaceState.update(`figmaFile-${fileKey}`, undefined);

        // Remove from file storate
        this.fileStorage.removeFigmaFile(fileKey);

        // TODO remove links
        // this.context.workspaceState.update(`links-${this.uri}`, undefined);

    }

}

/**
 * Stores human-readable data for Figma Sync in JSON format.
 * 
 * Sample structure:
 * 
        {
            links: {
                'c:/system/styles/style.less': [
                        ['12:89', 'body .button'],
                        ...
                ], 
                'c:/system/styles/anotehrStyle.less': [
                        ['71:24', 'body .button.primary'],
                        ...
                ],
            },
            figmaFiles: [
                'fecZ7gbRigCur2B1aZEcWaYV',
                '1aZbRIgCur2BEcWaYVdhcM7g',
                'cM7gbRW1aZdhaYVIgCur2BEc',
                ...
            ]
        }
 */
class FileStorage {
    /**
     * Path of the file meant to store this data
     */
    filePath: string;
    /**
     * Dictionary of files and links between figma layers and scopes witin those files
     */
    links: {[filePath: string]: string[][]} = {};
    /**
     * Array of figma file keys that are connected to this workspace
     */
    figmaFiles: string[] = [];

    constructor(filePath: string){
        this.filePath = filePath;
        this.readFile();
    }

    /**
     * Returns the full file path + file name of the storage file
     */
    getFilePath(): string{
        return path.join(this.filePath, fileName);
    }

    /**
     * Reads the file and populates the class properties
     */
    readFile(){
        try {
            // Read file
            let contents = fs.readFileSync(this.getFilePath(), {
                encoding: 'utf8'
            });
            if(contents){
                // Update the instance with the file values
                let contentsJSON = JSON.parse(contents);
                this.figmaFiles = contentsJSON.figmaFiles;
                this.links = contentsJSON.links;
            }

        } catch (error) {
            // File doesn't exist
            console.warn('File does not exist');
        }
    }

    /**
     * Adds a figma file to storage
     * @param fileKey 
     */
    addFigmaFile(fileKey: string){
        if(!this.figmaFiles.includes(fileKey)){
            this.figmaFiles.push(fileKey);

            // Save
            this.save();
        }
    }

    /**
     * 
     * @param fileKey 
     */
    removeFigmaFile(fileKey: string){
        let index = this.figmaFiles.indexOf(fileKey);
        if(index >= 0){
            this.figmaFiles.splice(index, 1);

            // Save changes
            this.save();
        }
    }
    
    /**
     * 
     */
    save(){
        let JSONString = JSON.stringify({
                links: this.links,
                figmaFiles: this.figmaFiles
            }, null, 4);

        // Write the file
        fs.writeFileSync(this.getFilePath(), JSONString, {
            encoding: 'utf8'
        });
    }
    

}