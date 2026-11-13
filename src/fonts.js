// 卡面和卡包貼圖是用 canvas 畫的,要等圓體載入完才畫,不然會用到備用字體。
export const fontReady = Promise.race([
  document.fonts ? document.fonts.load('700 24px Huninn', '週末小事日常').catch(() => {}) : Promise.resolve(),
  new Promise((r) => setTimeout(r, 1800)),
]);
