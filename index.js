'use strict';

const path = require('path');
const Promise = require('bluebird');
const fs = Promise.promisifyAll(require('fs'));
const xml2js = require('xml2js');
const _ = require('lodash');


const xsdPath = './d.xsd';
const xsdParser = xml2js.Parser({
   attrkey: '_attr',
   charkey: '_char',
   trim: true,
   tagNameProcessors: [stripPrefix],
   explicitArray: false,
});

let rootElement = 'LyncDiagnostics';

fs.readFileAsync(xsdPath)
   .then((data) => {
      xsdParser.parseString(data, (err, result) => {
         if (err) {throw err;}

         treeWalkTransform(result, [
            removeAttributes,
            compressAnnotationDocs,
            compressSimpleContent,
            foldEnumerations,
            foldPatterns,
            pullPropertiesFromAttributes,
            convertBaseToType,
            deleteEmptyAttributes,
         ]);

         let elemsToSimplify = _.mapKeys(result.schema.complexType, (val) => { return val.name; });
         let simplifiedElems = _.mapKeys(result.schema.simpleType, (val) => { return val.name; });


         while (Object.keys(elemsToSimplify).length > 0){
            simplify(elemsToSimplify, simplifiedElems);
            let newSimplifiedElems = extractSimplifiedElements(elemsToSimplify);
            _.assign(simplifiedElems, newSimplifiedElems);
         }

         let explodedTree = explodeTree(result, simplifiedElems);
         console.dir(explodedTree, {depth:null});
      });
   })
   .catch((err) => {
      console.error(err);
   });

function extractSimplifiedElements(elems){
   let simplifiedElems = {};

   Object.keys(elems).forEach((elemName) => {
      if (isSimplified(elems[elemName])){
         simplifiedElems[elemName] = elems[elemName];
         delete elems[elemName];
      }
   });

   return simplifiedElems;
}

function isSimplified(node){
   //Check for leaf nodes which are not elements
   if (node === null || node === undefined || typeof node !== 'object'){
      return true;
   }

   if (hasComplexType(node)){
      //Check if current node has a complexType
      return false;
   }
   //This node is simplified if all children are simplified
   return Object.keys(node).every((prop) => {
      return isSimplified(node[prop]);
   });
}

function hasComplexType(node){
   let baseTypes = {
      'xs:int': true,
      'xs:string': true,
      'xs:long': true,
      'xs:anyURI': true,
      'xs:boolean': true,
      'xs:byte': true,
      'xs:double': true,
      'xs:unsignedInt': true,
      'xs:dateTime': true,
      'xs:unsignedShort': true,
   };

   if (_.has(node, 'type') && !(node.type in baseTypes)){
      return true;
   }
   return false;
}

function simplify(node, simpleTypes){
   treeWalkTransform(node, [simplifierFactory(simpleTypes)]);
   return node;
}

function simplifierFactory(simpleTypes){
   return (node) => {
      return simplifyGenericNode(node, simpleTypes);
   };
}

function simplifyGenericNode(node, simpleTypes){
   if (node === undefined || node === null){
      return node;
   }

   if (node.type in simpleTypes){
      let simpleClone = _.cloneDeep(simpleTypes[node.type]);
      delete simpleClone.name;
      delete node.type;
      _.assign(node, simpleClone);
   }

   return node;
}

function stripPrefix(tagName){
   return tagName.replace(/.*:/, '');
}

//Walks the entire tree, applying an array of functions to the node
//Functions are applied to the node, before attempting to visit children
//Nodes must be objects or arrays
//In place function
function treeWalkTransform(node, transformationFuncs){
   if (node === null || node === undefined || typeof node !== 'object'){
      return;
   }

   let transformedNode = node;

   //Apply transformations to the current node
   transformationFuncs.forEach((transFunc) => {
      transformedNode = transFunc(transformedNode);
   });

   //Apply tranformations to all children (i.e. properties)
   Object.keys(node).forEach((propName) => {
      treeWalkTransform(node[propName], transformationFuncs);
   });
}

function compressAnnotationDocs(node){
   let docs = _.get(node, 'annotation.documentation');

   if (docs){
      node.description = docs;
      delete node['annotation'];
   }

   return node;
}

function compressSimpleContent(node){
   let extension = _.get(node, 'simpleContent.extension');

   if (extension){
      node.extension = extension;
      delete node['simpleContent'];
   }

   return node;
}

function pullPropertiesFromAttributes(node){
   let propsToPull = {
      'name': true,
      'type': true,
      'minOccurs': true,
      'maxOccurs': true,
      'use': true,
      'base': true,
      'value': true,
   };

   let attrs = node['_attr'];

   if (attrs){
      Object.keys(attrs).forEach((attrKey) => {
         if (propsToPull[attrKey]){
            if (node[attrKey]){
               throw new Error(`NODE ALREADY HAS KEY ${attrKey}`);
            }
            node[attrKey] = attrs[attrKey];
            delete attrs[attrKey];
         }
      });

      if (Object.keys(attrs).length === 0){
         delete node['_attr'];
      }
   }

   return node;
}

function convertBaseToType(node){
   let propsToConvert = [
      'restriction._attr.base',
      'extension._attr.base',
   ];

   propsToConvert.forEach((prop) => {
      let baseType = _.get(node, prop);
      if (baseType){
         if (node.type){
            throw new Error(`Node already has type property`);
         }
         node.type = baseType;
         _.unset(node, prop);
      }
   });

   return node;
}

function removeAttributes(node){
   let attrToRemove = {
      'elementFormDefault': true,
      'attributeFormDefault': true,
      'xmlns:xs': true,
      'version': true,
   };

   let attrs = node['_attr'];

   if (attrs){
      Object.keys(attrs).forEach((attrKey) => {
         if (attrToRemove[attrKey]){
            delete attrs[attrKey];
         }
      });
   }

   return node;
}

function deleteEmptyAttributes(node){
   let attrs = node['_attr'];

   if (attrs && Object.keys(attrs).length === 0){
      delete node['_attr'];
   }

   return node;
}

function foldEnumerations(node){
   let enums = node.enumeration;

   if (enums){
      if (!Array.isArray(enums)){
         enums = [enums];
      }
      node.enumeration = enums.reduce((accumulator, curr) => {
         accumulator.push(_.get(curr, '_attr.value'));
         return accumulator;
      }, []);
   }

   return node;
}

function compressSequence(node){
   let seq = _.get(node, 'sequence[0].element');

   if (seq){
      node.sequence = seq;
   }

   return node;
}

function foldPatterns(node){
   let patterns = node.pattern;

   if (patterns){
      if (!Array.isArray(patterns)){
         patterns = [patterns];
      }
      node.pattern = patterns.reduce((accumulator, curr) => {
         accumulator.push(_.get(curr, '_attr.value'));
         return accumulator;
      }, []);
   }

   return node;
}

function explodeTree(parsedXsd, simplifiedElems){
   let clonedRootElem = _.cloneDeep(parsedXsd.schema.element);

   let clonedSimple = _.cloneDeep(simplifiedElems[clonedRootElem.type]);
   delete clonedRootElem.type;
   delete clonedSimple.name;
   _.assign(clonedRootElem, clonedSimple);

   return clonedRootElem;
}


