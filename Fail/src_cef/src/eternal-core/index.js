import './styles/_main.scss'

const handleResize = () => {
    document.querySelector("html").style.fontSize = `${16 * (window.innerHeight /  1080)}px`;
}

export const onMounted = () => {
    window.addEventListener("resize", handleResize);
    handleResize();
};