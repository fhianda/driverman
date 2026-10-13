import {readFile,writeFile,mkdir,copyFile,rename} from 'node:fs/promises';
import {createHash} from 'node:crypto';

// Prépare les fichiers publics ; ne téléverse rien sur le serveur distant.
const buildDir=new URL('../mobile/android/app/build/outputs/apk/debug/',import.meta.url);
const metadata=JSON.parse(await readFile(new URL('output-metadata.json',buildDir),'utf8'));
if(metadata.applicationId!=='net.telesol.driverman'||metadata.elements?.length!==1) throw new Error('Build DriverMan unique requis.');
const build=metadata.elements[0];
if(!/^\d+(?:\.\d+)*$/.test(build.versionName)||build.outputFile!=='app-debug.apk') throw new Error('Version Android incorrecte.');
const bytes=await readFile(new URL(build.outputFile,buildDir));
const hash=data=>createHash('sha256').update(data).digest('hex');
const sha256=hash(bytes),file=`DriverMan-Android-${build.versionName}.apk`;
const target=new URL('../downloads/',import.meta.url);await mkdir(target,{recursive:true});
const destination=new URL(file,target);
try {
  if(hash(await readFile(destination))!==sha256) throw new Error('Ce numéro de version existe avec un autre APK. Augmentez la version avant publication.');
} catch(error) {if(error.code!=='ENOENT')throw error;await copyFile(new URL(build.outputFile,buildDir),destination);}
const release={version:build.versionName,versionCode:build.versionCode,file,bytes:bytes.length,sha256,channel:'test'};
await writeFile(new URL('android.json.tmp',target),JSON.stringify(release,null,2)+'\n');
await rename(new URL('android.json.tmp',target),new URL('android.json',target));
console.log(`${file} prêt dans downloads/ (${bytes.length} octets). Inclure ce dossier dans le déploiement web.`);
