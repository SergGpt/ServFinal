<script>
    import "./style.scss";
    import { marketStorage } from "store/marketPlace";
    import { countMoneyToDollar, formatThousands } from '../../modules/money';
    import marketPlaceConfig from "../../configs/settings";
    import { fade } from 'svelte/transition';
    import { itemsInfo } from '../../../../../json/itemsInfo';
    import InputSlider from "../../components/InputSlider/index.svelte";
    import { getName } from '../../modules/formats';
    import { getPrice } from "../../modules/money";

    export let setModal;
    export let type;
    export let price;
    export let callback;
    export let data;

    let time = marketPlaceConfig.minHours,
        count = 1,
        total = 0,
        countInStorage,
        itemInfo = data && data.type == "item" ? itemsInfo[data.params.itemId] : null;
        
    $: total = getPrice(data.type, count, price, time)
    $: countInStorage = $marketStorage.filter(x => 
        x.type == data.type 
        && x.params.itemId == data.params.itemId
        && (data == "clothes" ? x.params.itemData == data.params.itemData : true)).reduce((acc, data) => acc + data.params.count, 0);

    const handleMousedown = (event) => {
        if (event.target.className.includes("market-modal-container"))
            setModal(null)
    }

    const handleKeydown = (event) => {
        if (event.keyCode == 27)
            return setModal(null);
    }
</script>

<svelte:window on:mousedown={handleMousedown} on:keydown={handleKeydown} />

<div class="market-modal-container">
    <div class="modal-content">
        <button on:click={() => setModal(null)} class="modal-content__close">
            Закрыть <span class="close-button">ESC</span>
        </button>
        <div class="market-create__title">
            { type != "service" ? "Выставить лот" : "Разместить объявление" }
        </div>
        {#if type != "item" && type != "clothes"}
            <div class="market-create__text">
                Размещение объявлений является платной услугой. Прежде чем
                объявление станет доступно, необходимо указать время действия вашего
                объявления. Его можно будет продлить позже. Стоимость размещения
                зависит от категории имущества.
            </div>
        {:else}
            <div class="item-create-lot__info">
                <div class="info-row">
                    <div class="info-row__label">Название товара:</div>
                    <div class="info-row__value">{ getName(data) }</div>
                </div>
                <div class="info-row direction-row">
                    <div class="info-row__column">
                        <div class="info-row__label">Доступно кол-во: </div>
                        <div class="info-row__value">{ formatThousands(countInStorage) } шт.</div>
                    </div>
                </div>
            </div>
            <div class="item-create-lot__input">
                <div class="input__label">Стоимость продажи за 1 шт.</div>
                <input bind:value={price} placeholder="Введите значение" class="input__input" type="text" maxlength="32">
            </div>

            {#if countInStorage > 1}
                <InputSlider value={count} update={val => count = val} prefix="шт."
                    min={1} max={countInStorage} 
                    minLabel="Выставить на продажу" maxLabel="Доступно к продаже"/>
            {/if}
        {/if}
        <InputSlider value={time} update={(val) => time = val} prefix="ч."
            min={marketPlaceConfig.minHours} max={marketPlaceConfig.maxHours} 
            minLabel="Часы размещения" maxLabel="Максимальное значение"/>
        <div class="market-create__to-pay">
            {#if type == "service"}
                <div class="to-pay__title">
                    Цена вашего объявления: 
                    <span class="to-pay__title-value">{countMoneyToDollar(price)}</span>
                    
                    <br/> Процент от стоимости:
                    <span class="to-pay__title-value">{ marketPlaceConfig.servicePercent * 100 }%</span>
                    
                    <br/> Кол-во часов размещения:
                    <span class="to-pay__title-value">{ formatThousands(time) }</span>
                </div>
            {/if}
            <div class="to-pay__title price">
                Итоговая сумма:
            </div>
            <div class="to-pay__value">{countMoneyToDollar(total)}</div>
        </div>
        <div class="market-create__payment">
            <div class="payment__button-container">
                <button on:click={() => callback(time, "Wallet", count, price)} class="payment__button">
                    <svg xmlns="http://www.w3.org/2000/svg" width="1.2962962962962963vh" height="1.2019444444444443vh" viewBox="0 0 14 12.981" > <g id="wallet-money-cash-svgrepo-com" transform="translate(-1 -1.019)" > <path id="Контур_3" data-name="Контур 3" d="M13.5,5H3A1,1,0,0,1,3,3H5a.472.472,0,0,0,.5-.5A.472.472,0,0,0,5,2H3A2.006,2.006,0,0,0,1,4v8a2.006,2.006,0,0,0,2,2H13.5A1.473,1.473,0,0,0,15,12.5v-6A1.473,1.473,0,0,0,13.5,5ZM14,7.9v3.2a1.479,1.479,0,0,0-.5-.1h-2a1.5,1.5,0,0,1,0-3h2A1.479,1.479,0,0,0,14,7.9Z" fill="#3d82d5" ></path> <path id="Контур_4" data-name="Контур 4" d="M3.5,3.5A.472.472,0,0,0,3,4a.472.472,0,0,0,.5.5H13a.617.617,0,0,0,.4-.2.486.486,0,0,0,.05-.45l-1-2.5a.52.52,0,0,0-.65-.3L5.4,3.5Z" fill="#3d82d5" ></path> <path id="Контур_5" data-name="Контур 5" d="M12.5,9h-1a.5.5,0,0,0,0,1h1a.5.5,0,0,0,0-1Z" fill="#3d82d5" ></path> </g> </svg> 
                    Оплатить наличными
                </button>
                <button on:click={() => callback(time, "Card", count, price)} class="payment__button">
                    <svg xmlns="http://www.w3.org/2000/svg" width="1.2962962962962963vh" height="1.1666666666666665vh" viewBox="0 0 14 12.6" > <path id="Контур_2" data-name="Контур 2" d="M15.417,7.025v7a.7.7,0,0,1-.7.7H2.117a.7.7,0,0,1-.7-.7v-7Zm0-1.4h-14v-2.8a.7.7,0,0,1,.7-.7h12.6a.7.7,0,0,1,.7.7Zm-4.9,5.6v1.4h2.8v-1.4Z" transform="translate(-1.417 -2.125)" fill="#101010" ></path> </svg> 
                    Оплатить картой
                </button>
            </div>
        </div>
    </div>
</div>
