import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

export class Util {

    static writeFile(string: string, fileName:string){
        const wsFolders = vscode.workspace.workspaceFolders;
        if(wsFolders && wsFolders.length > 0){
            let folder = wsFolders[0].uri.fsPath;
            fs.writeFile(path.join(folder, fileName), string, err => {
                if (err) {
                    console.log(err);
                    return vscode.window.showErrorMessage(
                    "Failed to create file!"
                    );
                }
                vscode.window.showInformationMessage(`Created file ${fileName}`);
            });
        }
    }

}