<script>
    import { getName, getType } from "../../modules/formats";
    import { countMoneyToDollar, formatThousands } from "../../modules/money";
    import { serverTime } from "store/server";

    import InputSlider from "../../components/InputSlider/index.svelte";

    import "./style.scss";
    import { calculateDateDifference, convertSecondsToString } from "../../modules/time";

    export let type;
    export let setModal;
    export let callback;
    export let data;

    let count = 1;

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
        <div class="interaction-buy__title">
            Сделка о покупке
        </div>
        <div class="interaction-buy__info">
            <div class="info-row">
                <div class="info-row__label">
                    Название товара:
                </div>
                <div class="info-row__value">{ getName(data) }</div>
            </div>
            {#if type == "buy"}
                <div class="info-row">
                    <div class="info-row__label">
                        Тип имущества:
                    </div>
                    <div class="info-row__value">
                        { getType(data.type) }
                    </div>
                </div>
                <div class="info-row">
                    <div class="info-row__label">Продавец:</div>
                    <div class="info-row__value">
                        { data.author.name.replace("_", " ") } 
                        <span class="static-id">#{ data.author.id }</span>
                    </div>
                </div>
            {/if}

            {#if type == "buy-lot"}
                <div class="info-row direction-row connection">
                    <div>
                        <div class="info-row__label">Продавец: </div>
                        <div class="info-row__value">
                            { data.author.name.replace("_", " ") } 
                            <span class="static-id">#{ data.author.id }</span>
                        </div>
                    </div>

                    { #if data.author.phoneNumber != -1 }
                        <div class="author-interaction__square-button first">
                            <div class="tooltip">
                                <div class="tooltip__arrow">
                                    <svg height="6" viewBox="0 0 13 6" width="13" xmlns="http://www.w3.org/2000/svg"><path id="Многоугольник_8" d="M6.5,0,13,6H0Z" fill="#efefef"></path></svg>
                                </div>
                                <div class="tooltip__text">Позвонить автору</div>
                            </div>
                            <svg xmlns="http://www.w3.org/2000/svg" width="1.6666666666666665vh" height="1.6666666666666665vh" viewBox="0 0 18 18"> <g id="telephone-call" transform="translate(-1.286 -1.286)"> <path id="Контур_12651" data-name="Контур 12651" d="M18.9,15.017c-.562-.471-3.857-2.558-4.4-2.462-.257.046-.454.265-.98.893a7.513,7.513,0,0,1-.8.866,6.915,6.915,0,0,1-1.526-.566A9.45,9.45,0,0,1,6.823,9.386,6.915,6.915,0,0,1,6.258,7.86a7.513,7.513,0,0,1,.866-.8c.627-.526.847-.722.893-.98.1-.549-1.993-3.843-2.462-4.4-.2-.233-.375-.389-.6-.389C4.287,1.286,1.286,5,1.286,5.477c0,.039.064,3.9,4.943,8.866,4.963,4.879,8.826,4.943,8.866,4.943.481,0,4.191-3,4.191-3.664,0-.229-.156-.408-.39-.6Z" fill="#3d82d5"></path> <path id="Контур_12652" data-name="Контур 12652" d="M14.786,9.643h1.286A5.149,5.149,0,0,0,10.929,4.5V5.786A3.861,3.861,0,0,1,14.786,9.643Z" fill="#3d82d5"></path> <path id="Контур_12653" data-name="Контур 12653" d="M18,9.643h1.286a8.367,8.367,0,0,0-8.357-8.357V2.571A7.08,7.08,0,0,1,18,9.643Z" fill="#3d82d5"></path> </g> </svg>
                        </div>

                        <div class="author-interaction__square-button">
                            <div class="tooltip">
                                <div class="tooltip__arrow">
                                    <svg height="6" viewBox="0 0 13 6" width="13" xmlns="http://www.w3.org/2000/svg"><path id="Многоугольник_8" d="M6.5,0,13,6H0Z" fill="#efefef"></path></svg>
                                </div>
                                <div class="tooltip__text">Написать SMS</div>
                            </div>
                            <svg xmlns="http://www.w3.org/2000/svg" width="1.6666666666666665vh" height="1.6666666666666665vh" viewBox="0 0 18 18"> <g id="_01" data-name="01" transform="translate(-1.8 -1.8)"> <path id="Контур_12656" data-name="Контур 12656" d="M15.3,1.8h-9A4.493,4.493,0,0,0,1.8,6.286v6.282a4.493,4.493,0,0,0,4.5,4.486h1.35a1.018,1.018,0,0,1,.72.359l1.35,1.795a1.281,1.281,0,0,0,2.16,0l1.35-1.795a.9.9,0,0,1,.72-.359H15.3a4.493,4.493,0,0,0,4.5-4.486V6.287A4.493,4.493,0,0,0,15.3,1.8ZM11.7,12.375H6.3a.675.675,0,1,1,0-1.35h5.4a.675.675,0,0,1,0,1.35Zm3.6-4.5h-9a.675.675,0,0,1,0-1.35h9a.675.675,0,1,1,0,1.35Z" fill="#3d82d5"></path> </g> </svg>
                        </div>

                        <div class="author-interaction__phone-number">
                            <div class="value">{ data.author.phoneNumber }</div>
                            <div class="label">Тел. номер</div>
                        </div>
                    {/if}
                </div>

                <div class="info-row direction-row">
                    <div class="info-row__column">
                        <div class="info-row__label">Доступно кол-во:</div>
                        <div class="info-row__value">{formatThousands(data.count)} шт.</div>
                    </div>
                    <div class="info-row__column">
                        <div class="info-row__label">Цена за 1 шт:</div>
                        <div class="info-row__value">{countMoneyToDollar(data.cost)}</div>
                    </div>
                    <div class="info-row__column lot-timer">
                        <div class="info-row__label">Таймер лота: </div>
                        <div class="info-row__value">{ convertSecondsToString(calculateDateDifference(data.endTime, $serverTime)) }</div>
                    </div>
                </div>
            {/if}
        </div>
        {#if data.count > 1}
            <InputSlider value={count} update={val => count = val} prefix="шт."
                min={1} max={data.count} 
                minLabel="Количество" maxLabel="Стоимость"
                rightText={countMoneyToDollar(count * data.cost)}/>
        {/if}
        <div class="interaction-buy__payment">
            {#if type == "buy"}
                <div class="payment__to-pay">
                    <div class="payment__to-pay__label">
                        К оплате:
                    </div>
                    <div class="payment__to-pay__amount">
                        {countMoneyToDollar(data.cost)}
                    </div>
                </div>
            {/if}
            <div class="payment__button-container">
                <button on:click={() => callback(count, "Wallet")} class="payment__button">
                    <svg xmlns="http://www.w3.org/2000/svg" width="1.2962962962962963vh" height="1.2019444444444443vh" viewBox="0 0 14 12.981" > <g id="wallet-money-cash-svgrepo-com" transform="translate(-1 -1.019)" > <path id="Контур_3" data-name="Контур 3" d="M13.5,5H3A1,1,0,0,1,3,3H5a.472.472,0,0,0,.5-.5A.472.472,0,0,0,5,2H3A2.006,2.006,0,0,0,1,4v8a2.006,2.006,0,0,0,2,2H13.5A1.473,1.473,0,0,0,15,12.5v-6A1.473,1.473,0,0,0,13.5,5ZM14,7.9v3.2a1.479,1.479,0,0,0-.5-.1h-2a1.5,1.5,0,0,1,0-3h2A1.479,1.479,0,0,0,14,7.9Z" fill="#3d82d5" ></path> <path id="Контур_4" data-name="Контур 4" d="M3.5,3.5A.472.472,0,0,0,3,4a.472.472,0,0,0,.5.5H13a.617.617,0,0,0,.4-.2.486.486,0,0,0,.05-.45l-1-2.5a.52.52,0,0,0-.65-.3L5.4,3.5Z" fill="#3d82d5" ></path> <path id="Контур_5" data-name="Контур 5" d="M12.5,9h-1a.5.5,0,0,0,0,1h1a.5.5,0,0,0,0-1Z" fill="#3d82d5" ></path> </g> </svg> 
                    Оплатить наличными
                </button>
                <button on:click={() => callback(count, "Card")} class="payment__button">
                    <svg xmlns="http://www.w3.org/2000/svg" width="1.2962962962962963vh" height="1.1666666666666665vh" viewBox="0 0 14 12.6" > <path id="Контур_2" data-name="Контур 2" d="M15.417,7.025v7a.7.7,0,0,1-.7.7H2.117a.7.7,0,0,1-.7-.7v-7Zm0-1.4h-14v-2.8a.7.7,0,0,1,.7-.7h12.6a.7.7,0,0,1,.7.7Zm-4.9,5.6v1.4h2.8v-1.4Z" transform="translate(-1.417 -2.125)" fill="#101010" ></path> </svg> 
                    Оплатить картой
                </button>
            </div>
        </div>
        <div class="interaction-buy__warning">
            <div class="warning__label">ВНИМАНИЕ!</div>
            <div class="warning__text">
                После покупки, имущество попадет на склад. Его необходимо
                забрать в течении 48 часов с момента совершения сделки. В
                противном случае имущество отправится на аукцион.
            </div>
        </div>
    </div>
</div>
