'use strict';



const path = require('path');
const Promise = require('bluebird');
const fs = Promise.promisifyAll(require('fs'));
const xml2js = require('xml2js');




const xsdPath = './d.xsd';
const xsdParser = xml2js.Parser({
   attrkey: '_attr',
   charkey: '_char',
   trim: true,
   tagNameProcessors: [stripPrefix],
});

fs.readFileAsync(xsdPath)
   .then((data) => {
      xsdParser.parseString(data, (err, result) => {
         if (err) {throw err;}

         console.dir(result, {depth:null});

      });
   })
   .catch((err) => {
      console.error(err);
   });

function stripPrefix(tagName){
   return tagName.replace(/.*:/, '');
}




