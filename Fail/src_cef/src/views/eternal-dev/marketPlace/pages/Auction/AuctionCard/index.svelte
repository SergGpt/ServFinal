<script>
    import UserInfo from "../../../components/UserInfo/index.svelte";

    import BusienssInfo from "./components/BusinessInfo/index.svelte";
    import VehicleInfo from "./components/VehicleInfo/index.svelte";
    import HouseInfo from "./components/HouseInfo/index.svelte";

    import { charUUID } from "store/chars";
    import { serverTime } from "store/server";

    import { executeClient } from "api/rage";

    import { convertSecondsToString, calculateDateDifference, formatAuctionTime, convertMilesecondsToString } from "../../../modules/time"
    import { convertMoneyFloatToInteger } from "../../../modules/money";

    import "./style.scss";
    import { inFavourite } from "../../../modules/formats";
    import { getPicture } from "../../../modules/picture";
    import { marketAuctionSetBet, marketLotActions, setFavourite } from "../../../modules/functions";
    import { onMount } from "svelte";
    import marketPlaceConfig from "../../../configs/settings";

    export let backFunction;
    export let data;

    let currentBets = [];

    let picture = getPicture(data.type, data);

    const INFO_COMPONENTS = {
        business: BusienssInfo,
        vehicle: VehicleInfo,
        house: HouseInfo
    };

    let messages = [
        { author: 1, authorName: "Ilya Merumond", bet: 100000, newBet: 200000, date: Date.now(), upTime: 30 }
    ];

    onMount(() => {
        executeClient("client.marketPlace.request", "auction", data.id);
    });

    const setWaypoint = () => {
        marketLotActions("waypoint", data.id, data.params.position.x, data.params.position.y);
    };

    const onFavorite = () => {
        setFavourite(data);
    };

    const setBet = (multiplayer) => {
        marketAuctionSetBet(data.id, multiplayer);
    };

    window.marketPlace.resolve_auction = (data) => {
        messages = data;
    };
        
    $: currentBets = messages.reverse()
</script>

{#if data != null}
    <div class="page-data auction">
        <div class="header">
            <div class="header__content">
                <div class="back-container">
                    <button on:click={() => backFunction()} class="back-container__button">
                        <svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="1.2962962962962963vh" height="1.2962962962962963vh" viewBox="0 0 14 14" > <defs> <clipPath id="clip-path"> <rect id="Прямоугольник_4874" data-name="Прямоугольник 4874" width="14" height="14" transform="translate(43.58 12.58)" fill="#101010" ></rect> </clipPath> </defs> <g id="Группа_масок_22" data-name="Группа масок 22" transform="translate(-43.58 -12.58)" opacity="0.5" > <path id="Контур_12569" data-name="Контур 12569" d="M55.613,21.044h-12" transform="translate(1.966 -1.465)" fill="none" stroke="#101010" stroke-width="2" ></path> <path id="Контур_12570" data-name="Контур 12570" d="M48.814,12.58l-5,5,5,5" transform="translate(1.766 2)" fill="none" stroke="#101010" stroke-width="2" ></path> </g> </svg>
                    </button>
                    Вернуться назад
                </div>
            </div>

            <UserInfo />
        </div>

        <div class="content">
            <div class="left-side">
                <div class={ `lot-info__header lot-info__header-${data.type}` } style={ `background-image: url(${picture});` } >
                    <button on:click={() => onFavorite()} class:active={inFavourite(data)} class="header-button">
                        <svg xmlns="http://www.w3.org/2000/svg" width="1.2962962962962963vh" height="1.2052777777777777vh" viewBox="0 0 14 13.017" > <path id="like-svgrepo-com" d="M13.977,4.443A3.968,3.968,0,0,0,10.188.562,3.766,3.766,0,0,0,6.961,2.421,3.63,3.63,0,0,0,3.812.562,3.968,3.968,0,0,0,.023,4.443,4,4,0,0,0,.142,5.918,6.326,6.326,0,0,0,2.081,9.153l4.877,4.426,4.961-4.426a6.327,6.327,0,0,0,1.938-3.235A4.011,4.011,0,0,0,13.977,4.443Z" transform="translate(0 -0.562)" fill="#101010" ></path> </svg>
                    </button>
                   
                    {#if data.type == "house" || data.type == "business"}
                        <button on:click={() => setWaypoint()} class="header-button map">
                            <svg xmlns="http://www.w3.org/2000/svg" width="1.3021296296296296vh" height="1.4814814814814814vh" viewBox="0 0 14.063 16"> <g id="location" transform="translate(-0.969)"> <g id="Сгруппировать_3537" data-name="Сгруппировать 3537"> <g id="Сгруппировать_3536" data-name="Сгруппировать 3536"> <path id="Контур_12623" data-name="Контур 12623" d="M8,0A5.154,5.154,0,0,0,3.809,8.156l3.8,5.924a.469.469,0,0,0,.789,0l3.813-5.945A5.156,5.156,0,0,0,8,0ZM8,7.5a2.344,2.344,0,1,1,2.344-2.344A2.346,2.346,0,0,1,8,7.5Z" fill="#fcfcfc"></path> </g> </g> <g id="Сгруппировать_3539" data-name="Сгруппировать 3539"> <g id="Сгруппировать_3538" data-name="Сгруппировать 3538"> <path id="Контур_12624" data-name="Контур 12624" d="M11.665,10.772,9.3,14.462a1.55,1.55,0,0,1-2.609,0l-2.364-3.69c-2.08.481-3.362,1.362-3.362,2.415C.969,15.014,4.592,16,8,16s7.031-.986,7.031-2.812C15.031,12.134,13.747,11.252,11.665,10.772Z" fill="#fcfcfc"></path> </g> </g> </g> </svg>
                        </button>
                    {/if}
                    <div class="lot-info__header__badges">
                        <div class="badge">
                            <svg id="time" xmlns="http://www.w3.org/2000/svg" width="1.2962962962962963vh" height="1.2962962962962963vh" viewBox="0 0 14 14" > <g id="Сгруппировать_3512" data-name="Сгруппировать 3512" > <path id="Контур_12567" data-name="Контур 12567" d="M7,14A7,7,0,1,0,0,7,7,7,0,0,0,7,14ZM6.5,3a.5.5,0,1,1,1,0V6.76L9.813,8.61A.5.5,0,0,1,9.5,9.5a.492.492,0,0,1-.312-.11l-2.5-2A.5.5,0,0,1,6.5,7V3Z" fill="#3d82d5" ></path> </g> </svg>
                            { data.participants == 0 ? convertSecondsToString(marketPlaceConfig.auctionTime * 3600) : convertSecondsToString(calculateDateDifference(data.endDate, $serverTime, true)) }
                        </div>
                        <div class="badge">
                            <svg xmlns="http://www.w3.org/2000/svg" width="1.2962962962962963vh" height="1.0909259259259259vh" viewBox="0 0 14 11.782" > <g id="multiple-users-silhouette" transform="translate(0 -1.03)" > <path id="Контур_12568" data-name="Контур 12568" d="M8.448,3.052a2.544,2.544,0,0,1,1.184,1.89,2.052,2.052,0,1,0-1.184-1.89ZM7.1,7.256A2.053,2.053,0,1,0,5.05,5.2,2.053,2.053,0,0,0,7.1,7.256Zm.871.14H6.232A2.632,2.632,0,0,0,3.6,10.025v2.131l.005.033.147.046a11.967,11.967,0,0,0,3.575.576,7.338,7.338,0,0,0,3.121-.586l.137-.069H10.6V10.025A2.631,2.631,0,0,0,7.974,7.4Zm3.4-2.12H9.642a2.53,2.53,0,0,1-.781,1.763,3.124,3.124,0,0,1,2.231,2.989v.657a7.075,7.075,0,0,0,2.755-.579l.137-.07H14V7.905A2.632,2.632,0,0,0,11.371,5.276ZM3.5,5.137A2.04,2.04,0,0,0,4.592,4.82,2.541,2.541,0,0,1,5.548,3.2c0-.038.006-.077.006-.115A2.053,2.053,0,1,0,3.5,5.137Zm1.844,1.9a2.532,2.532,0,0,1-.78-1.753c-.064,0-.128-.01-.193-.01H2.629A2.632,2.632,0,0,0,0,7.905v2.131l.005.033.147.046a12.326,12.326,0,0,0,2.961.556v-.643A3.124,3.124,0,0,1,5.344,7.039Z" fill="#3d82d5" ></path> </g> </svg>
                            { new Set(messages.map(u => u.author)).size }
                        </div>
                    </div>
                </div>
                <div class="lot-info__container">
                    <svelte:component this={INFO_COMPONENTS[data.type]} data={data} />
                </div>
            </div>

            <div class="right-side">
                <div class="lot-broadcast__header">Трансляция торгов</div>
                <div class="lot-broadcast__container">
                    <div class="messages">
                        {#each currentBets as item, index }
                            {#if item.upTime > 0} 
                                <div class="message-transition">
                                    <div class="message message-extendTime">
                                        <svg id="time" xmlns="http://www.w3.org/2000/svg" width="1.2962962962962963vh" height="1.2962962962962963vh" viewBox="0 0 14 14"> <g id="Сгруппировать_3512" data-name="Сгруппировать 3512"> <path id="Контур_12567" data-name="Контур 12567" d="M7,14A7,7,0,1,0,0,7,7,7,0,0,0,7,14ZM6.5,3a.5.5,0,1,1,1,0V6.76L9.813,8.61A.5.5,0,0,1,9.5,9.5a.492.492,0,0,1-.312-.11l-2.5-2A.5.5,0,0,1,6.5,7V3Z" fill="#3d82d5"></path> </g> </svg> 
                                        Аукцион продлен на { convertSecondsToString(item.upTime, false) }
                                    </div>
                                </div>
                            {/if}

                            <div class="message-transition">
                                <div class="message message-setBid" class:message-owner={item.author == $charUUID}>
                                    <div class="message__participant">
                                        <div class="message__participant__name">
                                            { item.author == $charUUID ? 'Ваша ставка' : item.authorName }
                                        </div>
                                        { #if item.author != $charUUID}
                                            <div class="message__participant__staticId"> #{item.author} </div>
                                        {/if}
                                        <div class="message__time">{ formatAuctionTime(item.date) }</div>
                                    </div>
                                    <div class="message__content">
                                        Повысил ставку на 
                                        <span class="bid blue bold">{convertMoneyFloatToInteger(item.bet)}</span>
                                        текущая цена
                                        <span class="bid bold">{convertMoneyFloatToInteger(item.newBet)}</span>
                                    </div>
                                </div>
                            </div>
                        {/each}
                    </div>
                    <div class="buttons">
                        <button on:click={() => setBet(1)} class="marketPlace-button marketPlace-button__lot-bid">
                            <svg xmlns="http://www.w3.org/2000/svg" width="1.4814814814814814vh" height="1.4814814814814814vh" viewBox="0 0 16 16" > <rect id="Прямоугольник_4908" data-name="Прямоугольник 4908" width="16" height="16" rx="4" fill="#3d82d5" ></rect> <path id="Контур_12584" data-name="Контур 12584" d="M3.87,0H2.15V-4.47L1.03-3.34.05-4.37l2.33-2.3H3.87Zm7.46,0H9.3L7.85-2.24,6.4,0H4.36L6.69-3.42,4.51-6.67H6.54L7.85-4.58,9.14-6.67h2.04L9.01-3.43Z" transform="translate(2.31 11.335)" fill="#fcfcfc" ></path> </svg>
                            Повысить на { convertMoneyFloatToInteger(data.betStep) }
                        </button>
                        <button on:click={() => setBet(3)} class="marketPlace-button marketPlace-button__lot-bid">
                            <svg xmlns="http://www.w3.org/2000/svg" width="1.4814814814814814vh" height="1.4814814814814814vh" viewBox="0 0 16 16" > <rect id="Прямоугольник_4908" data-name="Прямоугольник 4908" width="16" height="16" rx="4" fill="#3d82d5" ></rect> <path id="Контур_12585" data-name="Контур 12585" d="M2.92.12A4.322,4.322,0,0,1,1.285-.17,2.912,2.912,0,0,1,.16-.93L1.03-2.1a2.236,2.236,0,0,0,.845.52,2.9,2.9,0,0,0,.975.18,1.582,1.582,0,0,0,.83-.18.538.538,0,0,0,.29-.47A.447.447,0,0,0,3.7-2.475,2.227,2.227,0,0,0,2.78-2.61q-.8,0-.9.01V-4.13q.13.01.9.01,1.08,0,1.08-.52A.49.49,0,0,0,3.55-5.1a1.817,1.817,0,0,0-.81-.155,2.425,2.425,0,0,0-1.66.64L.25-5.69A3.387,3.387,0,0,1,2.92-6.77a3.33,3.33,0,0,1,1.955.495A1.557,1.557,0,0,1,5.57-4.94a1.33,1.33,0,0,1-.425.985A1.879,1.879,0,0,1,4.11-3.44,1.9,1.9,0,0,1,5.2-2.955a1.389,1.389,0,0,1,.485,1.1A1.69,1.69,0,0,1,4.92-.43,3.335,3.335,0,0,1,2.92.12ZM12.88,0H10.85L9.4-2.24,7.95,0H5.91L8.24-3.42,6.06-6.67H8.09L9.4-4.58l1.29-2.09h2.04L10.56-3.43Z" transform="translate(1.5 11.325)" fill="#fcfcfc" ></path> </svg>
                            Повысить на { convertMoneyFloatToInteger(data.betStep * 3) }
                        </button>
                        <button on:click={() => setBet(5)} class="marketPlace-button marketPlace-button__lot-bid">
                            <svg xmlns="http://www.w3.org/2000/svg" width="1.4814814814814814vh" height="1.4814814814814814vh" viewBox="0 0 16 16" > <rect id="Прямоугольник_4908" data-name="Прямоугольник 4908" width="16" height="16" rx="4" fill="#3d82d5" ></rect> <path id="Контур_12586" data-name="Контур 12586" d="M3.09.12A3.678,3.678,0,0,1,.4-.85l.94-1.2a2.469,2.469,0,0,0,1.73.65,1.292,1.292,0,0,0,.8-.22.669.669,0,0,0,.285-.55.674.674,0,0,0-.27-.56,1.231,1.231,0,0,0-.77-.21,1.849,1.849,0,0,0-1.32.5L.61-2.73V-6.67H5.45v1.5H2.33v1.29a1.975,1.975,0,0,1,1.43-.53,2.13,2.13,0,0,1,1.515.6A2.061,2.061,0,0,1,5.91-2.24,2.133,2.133,0,0,1,5.15-.52,3.1,3.1,0,0,1,3.09.12ZM13.03,0H11L9.55-2.24,8.1,0H6.06L8.39-3.42,6.21-6.67H8.24L9.55-4.58l1.29-2.09h2.04L10.71-3.43Z" transform="translate(1.285 11.275)" fill="#fcfcfc" ></path> </svg>
                            Повысить на { convertMoneyFloatToInteger(data.betStep * 5) }
                        </button>
                    </div>
                </div>
            </div>
        </div>
    </div>
{/if}