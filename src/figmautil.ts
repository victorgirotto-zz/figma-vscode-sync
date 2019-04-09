import * as Figma from 'figma-js';

/*
    TODO I'm using the any type for the nodes since figma-js does not seem to
    have a supertype with the children property shared across different types of nodes.
*/

export class FigmaUtil {

    /*
        Gets all nodes that match a condition function
    */
    static getAllChildren(rootNode: any, condition: Function){
        let nodes: any[] = [];
        if(rootNode.children){
            rootNode.children.forEach((child: any) => {
                // Add the node itself if it's a match
                if(condition(child)){
                    nodes.push(child);
                }
                // Do the same for the children
                nodes.push(...this.getAllChildren(child, condition));
            });
        }
        return nodes;
    }

    /*
        Gets all nodes of a given type within the frame
    */
    static getAllChildrenByType(rootNode: any, type: string){
        return this.getAllChildren(rootNode, (node: any) => { return node.type === type });
    }

    /*
        Returns a color string for a Figma.Color. If alpha is different than 1, the string will be in rgba format. Otherwise, hex.
    */
    static getColorString(color: Figma.Color){
        if(color.a < 1){
            // Return in rgba
            return `rgba(${color.r},${color.g},${color.b},${color.a})`;
        } else {
            // Return in HEX
            return FigmaUtil.rgbaToHex(color);
        }
    }

    /*
        Converts a Figma.Color (rgba) to a hex string
    */
    static rgbaToHex(color: Figma.Color){
        let convert = (channel: number) => { return (channel * 255).toString(16).padStart(2,'0'); };
        let r = convert(color.r);
        let g = convert(color.g);
        let b = convert(color.b);
        return ('#'+r+g+b).toUpperCase();
    }

    /*
        Gets a css selector from a string (usuaylly the layer name in Figma).
        Should be enclosed in angle brackets. If no angle brackets found, return empty string;
    */
    static parseLayerName(name: string): string{
        let bracketContent = name.match(/<([^\s>]+)(\s|>)+/);
        if(bracketContent && bracketContent.length > 0){
            return bracketContent[1];
        }
        return '';
    }

    /*
        This method receives a list of components and sorts it by dependency, meaning that item 0 should depend on no component,
        item 1 should depend either on 0 or no component, item 2 only on 0,1 or no component, etc.
    */
    static sortByDependency(components: Figma.Component[]): Figma.Component[]{
        let sortedArray: Figma.Component[] = [];
        let componentsMap: { [name: string] : Figma.Component } = {};
        let dependencyMatrix: { [name: string] : string[] } = {}; // componentId -> instance1, instance2, instance 3, ...
        
        // Go through each component to create the dependencyMatrix and componentsMap
        components.forEach((component: Figma.Component) => {
            // Get all instances within this component
            let instances = FigmaUtil.getAllChildrenByType(component, 'INSTANCE');
            // Get an array of these instances' IDs
            let instanceIds = instances.map((instance: Figma.Instance) => { return instance.componentId; });
            // Create the connections between this component and its dependencies (i.e. inner instances)
            dependencyMatrix[component.id] = instanceIds;
            // Add to map for easy access later
            componentsMap[component.id] = component;
        });

        // Repeat until either we've completed the ordered array or until it doesn't change between iterations.
        // In the latter case, it means there's a missing dependency.
        let orderedLength = -1; // Holds the length of the 
        let sortedIds: string[] = []; // Create an array of sorted IDs
        while(sortedArray.length < components.length && orderedLength !== sortedArray.length){
            // Update ordered length
            orderedLength = sortedArray.length;
            // Go through each component in the matrix and check whether its dependencies are already in the orderedArray
            for(let id in dependencyMatrix){
                let dependencies = dependencyMatrix[id];
                // Get a boolean saying whether all dependencies for this component are already in the sorted array
                let areAllDependenciesInSortedArray = dependencies.reduce((acc, curr) => { return acc && sortedIds.includes(curr); }, true);
                if(dependencies.length === 0 || areAllDependenciesInSortedArray){
                    // All dependencies are there (or there are no dependencies). Add to sorted array.
                    sortedArray.push(componentsMap[id]);
                    // Add to sortedIds array
                    sortedIds.push(id);
                    // Remove this from the dependencies list to save future computations
                    delete dependencyMatrix[id];
                }                
            }
        }
        // Check if it ended prematurely, meaning one or more dependencies could not be resolved
        if(components.length !== sortedArray.length) {
            console.warn(`Could not resolve dependencies for ${components.length - sortedArray.length} components. The following components will not be included in the return array:`);
            console.warn(JSON.stringify(Object.keys(dependencyMatrix)));
        }

        // Return sorted array
        return sortedArray;
    }
}