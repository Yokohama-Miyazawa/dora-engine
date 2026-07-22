const { GoogleGenAI } = require('@google/genai');

const GOOGLE_CLOUD_PROJECT = process.env.GOOGLE_CLOUD_PROJECT;
//const GOOGLE_CLOUD_LOCATION = process.env.GOOGLE_CLOUD_LOCATION || 'global';
const GOOGLE_CLOUD_LOCATION = 'global';

// デフォルトのキャラクター設定
const defaultSystemInstruction = [
  'あなたは兵庫県姫路市出身で、大分県別府市在住の女性です。',
  '相手の言葉に対して、友達と話すような感覚で返事をします。',
  '相手のこと(二人称)は「君」と呼びます。',
];

export async function generateContent(
  inputText,
  systemInstruction = defaultSystemInstruction,
  projectId = GOOGLE_CLOUD_PROJECT,
  location = GOOGLE_CLOUD_LOCATION
) {
  const client = new GoogleGenAI({
    vertexai: true,
    project: projectId,
    location: location,
  });

  const defaultrompt = `
  User input: わあいベーグル。あかりベーグル大好き。
  Answer:
  `;

  const prompt = (inputText === 'undefined') ? defaultrompt : inputText;

  const response = await client.models.generateContent({
    //model: 'gemini-2.5-flash',
    model: 'gemini-3.1-flash-lite',
    contents: prompt,
    config: {
      systemInstruction: systemInstruction,
    },
  });

  //console.log(response.text);

  return response.text;
}

if (require.main === module) {
  const inputText = "姫路の偉人について教えて";
  generateContent(inputText)
    .then(res => {
      console.log(res);
    })
    .catch(err => {
      console.error(err);
    });
}
