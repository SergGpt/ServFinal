<script>
    import UserInfo from "../../../components/UserInfo/index.svelte";
    import InfoModal from "../../../modals/InfoModal/index.svelte";
    import CreateModal from "../../../modals/CreateModal/index.svelte";
    import BuyModal from "../../../modals/BuyModal/index.svelte";

    import { executeClient } from "api/rage";

    import { charUUID } from "store/chars";
    import { marketStorage } from "store/marketPlace";
    import { serverTime } from "store/server";

    import { getPicture } from "../../../modules/picture";
    
    import "./style.scss";
    import { countMoneyToDollar, formatThousands } from "../../../modules/money";
    import { calculateDateDifference, convertSecondsToString } from "../../../modules/time";
    import { itemsInfo } from "../../../../../../json/itemsInfo";
    import { onMount } from "svelte";
    import { getName, getSubname, inFavourite } from "../../../modules/formats";
    import { buyLot, createLot, setFavourite, setModalState } from "../../../modules/functions";

    export let data;
    export let backFunction;

    let otherItems = [{
        id: 3,
        author: {
            name: "Ilya Merumond",
            phoneNumber: -1,
            id: 3,
        },
        cost: 100,
        count: 23,
        endTime: 1732620643589
    },{
        id: 3,
        author: {
            name: "Ilya Merumond",
            phoneNumber: -1,
            id: 3,
        },
        cost: 100,
        count: 23,
        endTime: 1732620643589
    },],
    
    totalCount = data.count,
    minPrice = data.minPrice,
    itemInfo = itemsInfo[data.params.itemId],
    countInStorage = 0,
    hasAd = false;

    $: minPrice = Math.min(...otherItems.map(x => x.cost));
    $: totalCount = otherItems.reduce((acc, data) => acc + data.count, 0);
    $: countInStorage = $marketStorage.filter(x => 
        x.type == data.type 
        && x.params.itemId == data.params.itemId
        && (data == "clothes" ? x.params.itemData == data.params.itemData : true)).reduce((acc, data) => acc + data.params.count, 0);
    $: hasAd = otherItems.find(x => x.uuid == $charUUID) != null;

    onMount(() => {
        requestOtherItems();
    });

    const requestOtherItems = () => {
        executeClient("client.marketPlace.request", "items", data.type == "clothes" ? `${data.params.itemId}^${data.params.itemData}` : data.params.itemId);
    };

    window.marketPlace.resolve_items = (items) => {
        otherItems = items;
    };

    let modal = null,
        selectedItem = null;

    const onFavorite = () => {
        setFavourite(data);
    }

    const setModal = (modalName, item = null) => {
        modal = modalName;
        selectedItem = item;
        setModalState(modalName);
    }

    const onClick_deleteLot = () => {
        const myLot = otherItems.find(x => x.author.id == $charUUID);
        if (myLot == null)
            return;

        executeClient("client.marketPlace.delete_lot", myLot.id);
        setModal(null);

        requestOtherItems();

        if (otherItems.length == 1)
            backFunction();
    }

    const callbackCreateLot = (hours, paymentType, count, price) => {
        createLot(data, price, {
            hours,
            paymentType,
            count,
        });

        setModal(null);
        requestOtherItems();
    }

    const onClick_buy = (count, paymentType) => {
        buyLot(selectedItem.id, count, paymentType);
        setModal(null);
    };
</script>

<div class="page-data market">
    {#if modal != null}
        {#if modal == "create"}
            <CreateModal data={data} type={data.type} setModal={setModal} price={0} callback={callbackCreateLot} />
        {:else if modal == "buy-lot"}
            <BuyModal data={{
                ...selectedItem,
                type: data.type,
                params: {
                    ...data.params
                }
            }} type={modal} setModal={setModal} callback={onClick_buy} />
        {:else}
            <InfoModal type={modal} callback={onClick_deleteLot} setModal={setModal} />
        {/if}
    {/if}

    <div class="header">
        <div class="header__content">
            <div class="back-container">
                <button on:click={() => backFunction()} class="back-container__button">
                    <svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="1.2962962962962963vh" height="1.2962962962962963vh" viewBox="0 0 14 14"> <defs> <clipPath id="clip-path"> <rect id="Прямоугольник_4874" data-name="Прямоугольник 4874" width="14" height="14" transform="translate(43.58 12.58)" fill="#101010"></rect> </clipPath> </defs> <g id="Группа_масок_22" data-name="Группа масок 22" transform="translate(-43.58 -12.58)" opacity="0.5"> <path id="Контур_12569" data-name="Контур 12569" d="M55.613,21.044h-12" transform="translate(1.966 -1.465)" fill="none" stroke="#101010" stroke-width="2"></path> <path id="Контур_12570" data-name="Контур 12570" d="M48.814,12.58l-5,5,5,5" transform="translate(1.766 2)" fill="none" stroke="#101010" stroke-width="2"></path> </g> </svg>
                </button>
                Вернуться назад
            </div>
        </div>

        <UserInfo />
    </div>

    <div class="content">
        <div class="container__inner">
            <div class="container__inner__left-side">
                <div class="item-info__header">
                    <button on:click={() => onFavorite()} class:active={inFavourite(data)} class="favorite-button">
                        <svg xmlns="http://www.w3.org/2000/svg" width="1.2962962962962963vh" height="1.2052777777777777vh" viewBox="0 0 14 13.017"> <path id="like-svgrepo-com" d="M13.977,4.443A3.968,3.968,0,0,0,10.188.562,3.766,3.766,0,0,0,6.961,2.421,3.63,3.63,0,0,0,3.812.562,3.968,3.968,0,0,0,.023,4.443,4,4,0,0,0,.142,5.918,6.326,6.326,0,0,0,2.081,9.153l4.877,4.426,4.961-4.426a6.327,6.327,0,0,0,1.938-3.235A4.011,4.011,0,0,0,13.977,4.443Z" transform="translate(0 -0.562)" fill="#101010"></path> </svg>
                    </button>
                    <div class="item-info__header-image" style={ `background-image: url(${getPicture(data.type, data)})` }></div>
                </div>
                <div class="item-info__container">
                    <div class="item-info__container__title">
                        { getName(data) }
                    </div>
                    <div class="item-info__container__rows">
                        <div class="info__row">
                            <div class="info__column">
                                <div class="info__column__label">Категория:</div>
                                <div class="info__column__value">{ getSubname(data) }</div>
                            </div>
                        </div>
                        <div class="info__row">
                            <div class="info__column">
                                <div class="info__column__label">Цена от:</div>
                                <div class="info__column__value">{ countMoneyToDollar(minPrice) }</div>
                            </div>
                            <div class="info__column">
                                <div class="info__column__label">Кол-во:</div>
                                <div class="info__column__value">{ formatThousands(totalCount) }</div>
                            </div>
                        </div>
                    </div>
                    <div class="item-info__container__description">
                        <div class="item-info__container__description__label">Информация о предмете: </div>
                        <div class="item-info__container__description__value">{ itemInfo.Description }</div>
                    </div>
                    <div class="platform-interaction">
                        <div class="platform-interaction__buttons">
                            <button on:click={() => setModal("create")} class:disabled={countInStorage <= 0} class="platform-interaction__button add-lot">
                                <svg id="layer1" xmlns="http://www.w3.org/2000/svg" width="1.2962962962962963vh" height="1.2962962962962963vh" viewBox="0 0 14 14"> <path id="path823" d="M7.637.635a7,7,0,1,0,7,7A7.012,7.012,0,0,0,7.637.635Zm-.01,3.808a.636.636,0,0,1,.644.649V7h1.906a.637.637,0,0,1,0,1.274H8.271v1.906a.637.637,0,1,1-1.274,0V8.272H5.091A.638.638,0,1,1,5.091,7H7V5.092a.636.636,0,0,1,.63-.649Z" transform="translate(-0.634 -0.635)" fill="#fcfcfc" fill-rule="evenodd"></path> </svg> 
                                Добавить лот на продажу
                            </button>
                            {#if hasAd}
                                <button on:click={() => setModal("remove-lot")} class="platform-interaction__button remove-lot">
                                    <svg xmlns="http://www.w3.org/2000/svg" width="1.0127777777777778vh" height="1.2962962962962963vh" viewBox="0 0 10.938 14"> <path id="garbage" d="M12.211,4.156H3.538c-.009.107-.041-.463.587,8.957A.953.953,0,0,0,5.073,14h5.6a.953.953,0,0,0,.948-.887C12.253,3.685,12.22,4.261,12.211,4.156ZM6.163,12.248a.438.438,0,0,1-.474-.4L5.252,6.819a.438.438,0,0,1,.872-.076l.438,5.031A.437.437,0,0,1,6.163,12.248Zm2.149-.436a.437.437,0,1,1-.875,0V6.781a.437.437,0,1,1,.875,0ZM10.5,6.819l-.437,5.031a.438.438,0,0,1-.872-.076l.438-5.031a.438.438,0,1,1,.872.076Zm1.9-5.288H10.278c0-.058,0-.015,0-.581A.951.951,0,0,0,9.331,0H6.419a.951.951,0,0,0-.95.95c0,.556,0,.523,0,.581H3.356a.951.951,0,0,0-.95.95c0,.782,0,.745,0,.8H13.341c0-.056,0-.023,0-.8a.951.951,0,0,0-.95-.95ZM9.406,1.456a.075.075,0,0,1-.075.075H6.419a.075.075,0,0,1-.075-.075V.95A.075.075,0,0,1,6.419.875H9.331A.075.075,0,0,1,9.406.95Z" transform="translate(-2.406)" fill="#fcfcfc"></path> </svg> 
                                    Удалить лот с продажи
                                </button>
                            {/if}
                        </div>
                        <div class="platform-interaction__text">
                            { countInStorage <= 0 
                                ? "Этот предмет отсутствует на вашем складе. Вы не можете выставить лот на торговую площадку"
                                : "Этот предмет имеется на вашем складе. Вы можете выставить его лотом на торговую площадку"
                            }
                        </div>
                    </div>
                </div>
            </div>

            <div class="container__inner__right-side">
                <div class="lot-list">
                    <div class="lot-list__table">
                        <div class="table__row header">
                            <div class="table-column">ID</div>
                            <div class="table-column">Имя игрока</div>
                            <div class="table-column">Static</div>
                            <div class="table-column">Кол-во</div>
                            <div class="table-column">
                                Цена за 1 шт. 
                                <div class="table-column__icon">
                                    <svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="1.2962962962962963vh" height="1.2962962962962963vh" viewBox="0 0 14 14"> <defs> <clipPath id="clip-path"> <rect id="Прямоугольник_4874" data-name="Прямоугольник 4874" width="14" height="14" transform="translate(43.58 12.58)" fill="#101010"></rect> </clipPath> </defs> <g id="Группа_масок_22" data-name="Группа масок 22" transform="translate(-43.58 -12.58)" opacity="0.5"> <path id="Контур_12569" data-name="Контур 12569" d="M55.613,21.044h-12" transform="translate(1.966 -1.465)" fill="none" stroke="#101010" stroke-width="2"></path> <path id="Контур_12570" data-name="Контур 12570" d="M48.814,12.58l-5,5,5,5" transform="translate(1.766 2)" fill="none" stroke="#101010" stroke-width="2"></path> </g> </svg>
                                </div>
                            </div>
                            <div class="table-column">Таймер</div>
                            <div class="table-column">Действие</div>
                        </div>
                        <div class="table__rows-container">
                            {#each otherItems.filter(x => calculateDateDifference(x.endTime, $serverTime) > 0) as item, index }
                                <div class="table__row" class:table__row__author={item.author.id == $charUUID}>
                                    <div class="table-column">{item.id}</div>
                                    <div class="table-column">{item.author.name.replace("_", " ")}</div>
                                    <div class="table-column">#{item.author.id}</div>
                                    <div class="table-column">{item.count}</div>
                                    <div class="table-column">{countMoneyToDollar(item.cost)}</div>
                                    <div class="table-column">{convertSecondsToString(calculateDateDifference(item.endTime, $serverTime))}</div>
                                    <button on:click={() => {
                                        if (item.author.id == $charUUID) {
                                            setModal("remove-lot")
                                        }
                                        else {
                                            setModal("buy-lot", item)
                                        }
                                    }} class="table-column table-column__button">{ item.author.id == $charUUID ? "Удалить лот" : "Купить" }</button>
                                </div>
                            {/each}
                        </div>
                    </div>
                </div>
                <div class="lots-chart">
                    <!-- <div class="lots-chart__header">
                        <div class="lots-chart__header__label">Медиана цен</div>
                        <div class="lots-chart__header__time-range">
                            <div class="active lots-chart__header__time-range__button">Неделя</div>
                            <div class="lots-chart__header__time-range__button">Месяц</div>
                            <div class="lots-chart__header__time-range__button">Год</div>
                        </div>
                    </div>
                    <div class="lots-chart__chart">
                        
                    </div> -->
                </div>
            </div>
        </div>
    </div>
</div>
