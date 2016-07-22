const express = require('express');

let app = express();

app.use(express.static('public'));
app.use('/node_modules', express.static('node_modules'));

app.listen(3000, (err) => {
    if (err) {throw err;}

    console.log('Listening on port 3000 ... ');
});