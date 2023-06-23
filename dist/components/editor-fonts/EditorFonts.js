"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getFontsCSS = exports.familyFonts = exports.editorFonts = exports.customFonts = exports.googleFonts = void 0;
exports.googleFonts = [
    { name: 'Amiri', value: 'Amiri' },
    { name: 'Baskerville', value: 'Libre Baskerville' },
    { name: 'Garamond', value: 'EB Garamond' },
    { name: 'Lato', value: 'Lato' },
    { name: 'Merriweather', value: 'Merriweather' },
    { name: 'Montserrat', value: 'Montserrat' },
    { name: 'Noto Sans', value: 'Noto Sans' },
    { name: 'Noto Serif', value: 'Noto Serif' },
    { name: 'Open Sans', value: 'Open Sans' },
    { name: 'Oswald', value: 'Oswald' },
    { name: 'PT Sans', value: 'PT Sans' },
    { name: 'Raleway', value: 'Raleway' },
    { name: 'Roboto', value: 'Roboto' },
    { name: 'Rubik', value: 'Rubik' },
    { name: 'Slabo 27px', value: 'Slabo 27px' },
    { name: 'Source Sans Pro', value: 'Source Sans Pro' },
];
exports.customFonts = [
    { name: 'Arial', value: 'Arial' },
    { name: 'Caslon', value: 'Caslon' },
    { name: 'Courier New', value: 'Courier New' },
    { name: 'Didot', value: 'Didot' },
    { name: 'Futura', value: 'Futura' },
    { name: 'Gill Sans', value: 'Gill Sans' },
    { name: 'Helvetica', value: 'Helvetica' },
    { name: 'Liberation Serif', value: 'Liberation Serif' },
];
exports.editorFonts = [...exports.googleFonts, ...exports.customFonts].sort((a, b) => a.name.localeCompare(b.name));
const generateFontFamilyFormats = (fonts) => {
    return fonts
        .map((font) => `${font.name}=${font.value}`)
        .join(';');
};
exports.familyFonts = generateFontFamilyFormats(exports.editorFonts);
const getFontsCSS = () => {
    return '/css/javascriv-fonts.css';
};
exports.getFontsCSS = getFontsCSS;
