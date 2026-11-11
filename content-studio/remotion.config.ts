import { Config } from "@remotion/cli/config";

// Os episódios (roteiro, voz e tempos) são servidos como arquivos estáticos.
Config.setPublicDir("./episodes");
Config.setVideoImageFormat("jpeg");
// Sem rede para baixar o Chrome do Remotion: use o headless shell da máquina, se houver.
if (process.env.REMOTION_BROWSER_EXECUTABLE) Config.setBrowserExecutable(process.env.REMOTION_BROWSER_EXECUTABLE);
