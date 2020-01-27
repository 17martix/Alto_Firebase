const functions = require('firebase-functions');
const {Storage} = require('@google-cloud/storage');
const storage = new Storage();
const admin = require('firebase-admin');
admin.initializeApp();

const path = require('path');
const os = require('os');
const fs = require('fs');
const ffmpeg = require('fluent-ffmpeg');
const ffmpeg_static = require('ffmpeg-static');

const mm = require('music-metadata');

exports.audioProcess = functions.storage.object().onFinalize(async (object) => {
    const fileBucket = object.bucket; // The Storage bucket that contains the file.
    const filePath = object.name; // File path in the bucket.
    const contentType = object.contentType; // File content type.
    const url = object.selfLink; // File url

    // Exit if this is triggered on a file that is not an audio.
    if (!contentType.startsWith('audio/')) {
        console.log('This is not an audio.');
        return null;
    }

    const bucket = storage.bucket(fileBucket);
    let stream = bucket.file(filePath).createReadStream();

    mm.parseStream(stream)
    .then( (metadata) => metadata.common)
    .then((data)=>{
        const record = {
            title : data.title ? data.title : "Others",
            artist : data.artist ? data.artist : "Others",
            album : data.album ? data.album : "Others",
            year : data.year ? data.year : 0,
            genre : data.genre ? data.genre : ["Others"],
            track : data.track ? data.track : {no: 1, of: 1},
            label : data.label ? data.label : ["Others"],
            releasecountry: data.releasecountry ? data.releasecountry : "Others",
            acoustid_id : data.acoustid_id ? data.acoustid_id : "Others",
            url : url,
            path : filePath
        }

        // eslint-disable-next-line promise/no-nesting
        admin.firestore().collection('songs').add(record)
        .then(_ref =>{
            return console.log('Added document with ID');
        }).catch(err=>{
            console.error(err.message);
        });

        return console.log("Success retrieving metadata");
    })
    .catch( err => {
        return console.error(err.message);
    });

   return console.log('processaudio Success');

});

exports.deleteAudio = functions.firestore.document('songs/{songId}').onDelete((snap, context)=>{
    const deletedValue = snap.data();
    const filePath = deletedValue.path;
    const bucket = admin.storage().bucket();

    return bucket.deleteFiles({
        prefix: filePath
    });

});