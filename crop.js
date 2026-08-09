import Jimp from 'jimp';

async function cropImage() {
  try {
    const image = await Jimp.read('public/vetoralogo.png');
    image.autocrop();
    await image.writeAsync('public/vetoralogo.png');
    console.log('Cropped vetoralogo.png successfully.');
  } catch (err) {
    console.error('Error cropping image:', err);
  }
}

cropImage();
