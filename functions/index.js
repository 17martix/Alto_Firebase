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
const algoliasearch = require('algoliasearch');

const mm = require('music-metadata');

/*
const ALGOLIA_ID = functions.config().algolia.appid;
const ALGOLIA_ADMIN_KEY = functions.config().algolia.apikey;
const ALGOLIA_SEARCH_KEY = functions.config().algolia.searchkey;*/

const ALGOLIA_ID = "NZ8GS0LJI8";
const ALGOLIA_ADMIN_KEY = "1d7774f0d90cd21ea6826d614b1947f7";
const ALGOLIA_SEARCH_KEY = "dae25da279932c487036c12678a95106";

const ALGOLIA_INDEX_NAME = 'alto_main_search';
const client = algoliasearch(ALGOLIA_ID, ALGOLIA_ADMIN_KEY);

exports.on_song_uploaded = functions.region('europe-west1')
.storage.object().onFinalize(async (object) => {
    const fileBucket = object.bucket; // The Storage bucket that contains the file.
    const filePath = object.name; // File path in the bucket.
    const contentType = object.contentType; // File content type.

    // Exit if this is triggered on a file that is not an audio.
    if (!contentType.startsWith('audio/')) {
        console.log('This is not an audio.');
        return null;
    }

    const bucket = storage.bucket(fileBucket);
    let stream = bucket.file(filePath).createReadStream();

    // eslint-disable-next-line promise/no-nesting
    let song = admin.firestore().collection('songs').doc();
    let id = song.id;

    mm.parseStream(stream)
    .then( (metadata) => metadata.common)
    .then((data)=>{
        const record = {
            title : data.title ? data.title : "Others",
            artist : data.artist ? data.artist : "Others",
            album : data.album ? data.album : "Others",
            year : data.year ? data.year : 0,
            genre : data.genre ? data.genre[0] : "Others",
            track : data.track.no ? data.track.no : 1,
            label : data.label ? data.label[0] : "Others",
            releasecountry: data.releasecountry ? data.releasecountry : "Others",
            lyrics: data.lyrics ? data.lyrics[0] : "None",
            acoustid_id : data.acoustid_id ? data.acoustid_id : "Others",
            bpm : data.bpm ? data.bpm : 0,
            license : data.encodedby ? data.encodedby : "private",
            path : filePath,
            releasedate : data.date ? data.date : "0000-00-00",
            mood : data.mood ? data.mood : "Others",
            id : id
        }

        // eslint-disable-next-line promise/no-nesting
        admin.firestore().collection('songs').doc(id).set(record)
        .then(_ref =>{
            //admin.firestore().collection('songs').doc(_ref.id).update({id : _ref.id})
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

exports.on_song_record_deleted = functions.region('europe-west1')
.firestore.document('songs/{songId}').onDelete((snap, context)=>{
    const deletedValue = snap.data();
    const bucket = admin.storage().bucket();
    const filePath = deletedValue.path;

    delete_song_records(deletedValue.id);

   return bucket.file(filePath).delete();

});


exports.on_song_record_created = functions.region('europe-west1')
.firestore.document('songs/{songId}').onCreate((snap, context) => {
    // Get the song document
    const song = snap.data();
  
    // Add an 'objectID' field which Algolia requires
    song.objectID = context.params.songId;
  
    // Write to the algolia index
    const index = client.initIndex(ALGOLIA_INDEX_NAME);
    return index.saveObject(song);
});

/*
exports.on_song_file_deleted = functions.region('europe-west1')
.storage.object().onDelete(async (object) => {
    const fileBucket = object.bucket; // The Storage bucket that contains the file.
    const filePath = object.name; // File path in the bucket.
    let file_id;
    
    let db = admin.firestore();
    db.collection('songs').where('path','==',filePath).get()
    .then(snapshot =>{

        snapshot.forEach(element => {
            file_id = element.id;
        });

        delete_song_records(file_id);
        return console.log('deleting song records done');
    }).catch( err => {
        return console.error(err.message);
    });

    return console.log('deleting song file success');
});
*/

function delete_song_records(id){
    let db = admin.firestore();
    db.collection('metrics').doc(id).delete();
    
    db.collection('users').get()
    .then(snapshot =>{
        snapshot.forEach(doc => {
            db.collection('users').doc(doc.id).collection('library').doc(id).delete();
            db.collection('users').doc(doc.id).collection('recommended').doc(id).delete();
            // eslint-disable-next-line promise/no-nesting
            db.collection('users').doc(doc.id).collection('playlists').get()
            .then((playlists) =>{

                playlists.forEach((playlist) =>{
                    db.collection('users').doc(doc.id).collection('playlists').doc(playlist.id)
                    .collection('songs').doc(id).delete();
                });

                return console.log('deleting playlist song records success');
            }).catch( err => {
                return console.error(err.message);
            });
        });

        return console.log('deleting song records success');
    }).catch( err => {
        return console.error(err.message);
    });
}