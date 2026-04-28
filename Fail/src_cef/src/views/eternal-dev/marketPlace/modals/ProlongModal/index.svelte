<script>
    import InputSlider from "../../components/InputSlider/index.svelte";
    import marketPlaceConfig from "../../configs/settings";
    import { calculateDateDifference } from "../../modules/time";
    import { serverTime } from "store/server";

    import "./style.scss";
    import { countMoneyToDollar, getPrice } from "../../modules/money";

    export let data;
    export let setModal;
    export let callback;

    let time = 0,
        max = marketPlaceConfig.maxHours,
        min = 0
        price = 0;

    const calculateMax = (server, endDate) => {
        const difference = calculateDateDifference(server, endDate)
        return marketPlaceConfig.maxHours - Math.ceil(difference / 3600);
    };
    
    $: price = getPrice(data.type, 1, data.cost, time);
    $: max = calculateMax($serverTime, data.endDate);
</script>

<div class="market-modal-container">
    <div class="modal-content">
        <button on:click={() => setModal(null)} class="modal-content__close">
            Закрыть <span class="close-button">ESC</span>
        </button>
        <div class="market-prolong__title">
            Продлить объявление
        </div>
        <div class="market-prolong__text">
            Размещение объявлений является платной услугой. Прежде чем
            объявление станет доступно, необходимо указать время действия вашего
            объявления. Его можно будет продлить позже. Стоимость размещения
            зависит от категории имущества.
        </div>
        <div class="market-prolong__slider">
            <InputSlider value={time} update={(val) => time = val} prefix="ч."
                min={0} max={max} 
                minLabel="Часы размещения" maxLabel="Максимальное значение"/>
        </div>
        <div class="market-prolong__to-pay">
            <div class="to-pay__title">К оплате:</div>
            <div class="to-pay__value">{ countMoneyToDollar(price) }</div>
        </div>
        <div class="market-prolong__payment">
            <div class="payment__button-container">
                <button on:click={() => callback(time, "Wallet")} class="payment__button">
                    <svg xmlns="http://www.w3.org/2000/svg" width="1.2962962962962963vh" height="1.2019444444444443vh" viewBox="0 0 14 12.981" > <g id="wallet-money-cash-svgrepo-com" transform="translate(-1 -1.019)" > <path id="Контур_3" data-name="Контур 3" d="M13.5,5H3A1,1,0,0,1,3,3H5a.472.472,0,0,0,.5-.5A.472.472,0,0,0,5,2H3A2.006,2.006,0,0,0,1,4v8a2.006,2.006,0,0,0,2,2H13.5A1.473,1.473,0,0,0,15,12.5v-6A1.473,1.473,0,0,0,13.5,5ZM14,7.9v3.2a1.479,1.479,0,0,0-.5-.1h-2a1.5,1.5,0,0,1,0-3h2A1.479,1.479,0,0,0,14,7.9Z" fill="#3d82d5" ></path> <path id="Контур_4" data-name="Контур 4" d="M3.5,3.5A.472.472,0,0,0,3,4a.472.472,0,0,0,.5.5H13a.617.617,0,0,0,.4-.2.486.486,0,0,0,.05-.45l-1-2.5a.52.52,0,0,0-.65-.3L5.4,3.5Z" fill="#3d82d5" ></path> <path id="Контур_5" data-name="Контур 5" d="M12.5,9h-1a.5.5,0,0,0,0,1h1a.5.5,0,0,0,0-1Z" fill="#3d82d5" ></path> </g> </svg> 
                    Оплатить наличными
                </button>
                <button on:click={() => callback(time, "Card")} class="payment__button">
                    <svg xmlns="http://www.w3.org/2000/svg" width="1.2962962962962963vh" height="1.1666666666666665vh" viewBox="0 0 14 12.6" > <path id="Контур_2" data-name="Контур 2" d="M15.417,7.025v7a.7.7,0,0,1-.7.7H2.117a.7.7,0,0,1-.7-.7v-7Zm0-1.4h-14v-2.8a.7.7,0,0,1,.7-.7h12.6a.7.7,0,0,1,.7.7Zm-4.9,5.6v1.4h2.8v-1.4Z" transform="translate(-1.417 -2.125)" fill="#101010" ></path> </svg> 
                    Оплатить картой
                </button>
            </div>
        </div>
    </div>
</div>
