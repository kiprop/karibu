/**
 * Destination photos: freely licensed pictures from Wikimedia Commons, credited as their licences require.
 * Used for places only (never as a business's photo). Places without one show a drawn scene.
 * To add one: pick a Commons file, copy its exact file name, author and licence from the file page.
 */
export type PlacePhoto = { file: string; author: string; licence: string; alt: string };

export const PLACE_PHOTOS: Record<string, PlacePhoto> = {
  'maasai-mara': { file: 'Masai Mara National Reserve 20 - Mara river crossing.jpg', author: 'Thomas Fuhrmann', licence: 'CC BY-SA 4.0', alt: 'Wildebeest crossing the Mara River' },
  amboseli: { file: 'Elephants at Amboseli national park against Mount Kilimanjaro.jpg', author: 'Amoghavarsha JS', licence: 'CC BY-SA', alt: 'Elephants in Amboseli with Mount Kilimanjaro behind' },
  nairobi: { file: 'Nairobi cityscape.jpg', author: 'Sam Stearman', licence: 'CC BY-SA 3.0', alt: 'The Nairobi skyline' },
  zanzibar: { file: 'Stone town ,Zanzibar.jpg', author: 'Erasmus Kamugisha', licence: 'CC BY-SA', alt: 'Rooftops of Stone Town, Zanzibar' },
};

const enc = (f: string) => encodeURIComponent(f.replace(/ /g, '_'));
export const placePhotoUrl = (p: PlacePhoto, width = 1280) => `https://commons.wikimedia.org/wiki/Special:FilePath/${enc(p.file)}?width=${width}`;
export const placePhotoPage = (p: PlacePhoto) => `https://commons.wikimedia.org/wiki/File:${enc(p.file)}`;
