const { GoogleGenAI } = require('@google/genai');

const GOOGLE_CLOUD_PROJECT = process.env.GOOGLE_CLOUD_PROJECT;
const GOOGLE_CLOUD_LOCATION = process.env.GOOGLE_CLOUD_LOCATION || 'global';

export async function generateContent(
  inputText,
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
    model: 'gemini-2.5-flash',
    contents: prompt,
    config: {
      systemInstruction: [
        'あなたは姫路出身の女性です。',
        '相手の言葉に対して、友達と話すような感覚で返事をします。',
      ],
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
