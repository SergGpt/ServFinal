<script>
    import marketPlaceConfig from "../../configs/settings";
    import { countMoneyToDollar } from "../../modules/money";
    import "./style.scss";

    export let type;
    export let callback;
    export let setModal;

    const handleMousedown = (event) => {
        if (event.target.className.includes("market-modal-container"))
            setModal(null)
    }

    const handleKeydown = (event) => {
        if (event.keyCode == 27)
            return setModal(null);
    }
</script>

<svelte:window on:mousedown={handleMousedown}  on:keydown={handleKeydown}/>

<div class="market-modal-container">
    <div class="modal-content">
        <button on:click={() => setModal(null)} class="modal-content__close">
            Закрыть <span class="close-button">ESC</span>
        </button>

        {#if type == "remove" || type == "remove-lot"}
            <div class="market-remove__title">
                { type == "remove" ? "Удалить объявление" : "Удалить лот" }
            </div>
            <div class="market-remove__text">
                { type == "remove" ? "Внимание, после этого действия, у вас не получится сохранить информацию и фотографии. Ваше объявление будет безвозвратно удалено." 
                : "Ваш лот будет безвозвратно удален." }
            </div>
            <div class="market-remove__to-pay">
                <div class="to-pay__label">К оплате</div>
                <div class="to-pay__value">{ countMoneyToDollar(marketPlaceConfig.removeLotPrice) }</div>
            </div>
            <button on:click={() => callback()} class="market-remove__button">
                Удалить объявление
            </button>
        {/if}
    </div>
</div>
