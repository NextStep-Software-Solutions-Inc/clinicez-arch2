export const waitForNextFrame = () => new Promise<void>((resolve) => {
    requestAnimationFrame(() => resolve());
});