<script>
    import { serverTime } from "store/server";
    import { convertSecondsToString, calculateDateDifference } from "../../../modules/time"
    import { getType, getName, inFavourite } from "../../../modules/formats";
    import { countMoneyToDollar, formatThousands } from "../../../modules/money";
    import { getPicture } from "../../../modules/picture";
    import marketPlaceConfig from "../../../configs/settings";
    import { setFavourite } from "../../../modules/functions";

    export let data;
    export let onClick;

    let picture = getPicture(data.type, data);

    const onFavorite = () => {
        setFavourite(data);
    }

    $: picture = getPicture(data.type, data);
</script>

<button on:click={(e) => e.target.className.includes("favorite-button") ? false : onClick(data)} class="auction-card">
    <div class={ `auction-card__header auction-card__header-${data.type}` }>
        <button on:click={() => onFavorite()} class:active={ inFavourite(data) } class="favorite-button">
            <svg xmlns="http://www.w3.org/2000/svg" width="1.2962962962962963vh" height="1.2052777777777777vh" viewBox="0 0 14 13.017" > <path id="like-svgrepo-com" d="M13.977,4.443A3.968,3.968,0,0,0,10.188.562,3.766,3.766,0,0,0,6.961,2.421,3.63,3.63,0,0,0,3.812.562,3.968,3.968,0,0,0,.023,4.443,4,4,0,0,0,.142,5.918,6.326,6.326,0,0,0,2.081,9.153l4.877,4.426,4.961-4.426a6.327,6.327,0,0,0,1.938-3.235A4.011,4.011,0,0,0,13.977,4.443Z" transform="translate(0 -0.562)" fill="#101010" ></path> </svg>
        </button>
        <div class="auction-card__header__badges">
            <div class="badge participants">
                <svg xmlns="http://www.w3.org/2000/svg" width="1.2962962962962963vh" height="1.0909259259259259vh" viewBox="0 0 14 11.782" > <g id="multiple-users-silhouette" transform="translate(0 -1.03)" > <path id="Контур_12568" data-name="Контур 12568" d="M8.448,3.052a2.544,2.544,0,0,1,1.184,1.89,2.052,2.052,0,1,0-1.184-1.89ZM7.1,7.256A2.053,2.053,0,1,0,5.05,5.2,2.053,2.053,0,0,0,7.1,7.256Zm.871.14H6.232A2.632,2.632,0,0,0,3.6,10.025v2.131l.005.033.147.046a11.967,11.967,0,0,0,3.575.576,7.338,7.338,0,0,0,3.121-.586l.137-.069H10.6V10.025A2.631,2.631,0,0,0,7.974,7.4Zm3.4-2.12H9.642a2.53,2.53,0,0,1-.781,1.763,3.124,3.124,0,0,1,2.231,2.989v.657a7.075,7.075,0,0,0,2.755-.579l.137-.07H14V7.905A2.632,2.632,0,0,0,11.371,5.276ZM3.5,5.137A2.04,2.04,0,0,0,4.592,4.82,2.541,2.541,0,0,1,5.548,3.2c0-.038.006-.077.006-.115A2.053,2.053,0,1,0,3.5,5.137Zm1.844,1.9a2.532,2.532,0,0,1-.78-1.753c-.064,0-.128-.01-.193-.01H2.629A2.632,2.632,0,0,0,0,7.905v2.131l.005.033.147.046a12.326,12.326,0,0,0,2.961.556v-.643A3.124,3.124,0,0,1,5.344,7.039Z" fill="#3d82d5" ></path> </g> </svg> 
                { formatThousands(data.participants) }
            </div>
            <div class="badge time">
                <svg id="time" xmlns="http://www.w3.org/2000/svg" width="1.2962962962962963vh" height="1.2962962962962963vh" viewBox="0 0 14 14" > <g id="Сгруппировать_3512" data-name="Сгруппировать 3512" > <path id="Контур_12567" data-name="Контур 12567" d="M7,14A7,7,0,1,0,0,7,7,7,0,0,0,7,14ZM6.5,3a.5.5,0,1,1,1,0V6.76L9.813,8.61A.5.5,0,0,1,9.5,9.5a.492.492,0,0,1-.312-.11l-2.5-2A.5.5,0,0,1,6.5,7V3Z" fill="#3d82d5" ></path> </g> </svg> 
                { data.participants == 0 ? convertSecondsToString(marketPlaceConfig.auctionTime * 3600) : convertSecondsToString(calculateDateDifference(data.endDate, $serverTime, true)) }
            </div>
        </div>
        <div class="auction-card__header__image" style={ `--background-image: url(${picture});` }></div>
    </div>
    <div class="auction-card__content">
        <div class="title">{ getName(data) }</div>
        <div class="type">{ getType(data.type) }</div>
        <div class="price">
            <div class="animated-number">
                <span>{ countMoneyToDollar(data.currentBet) }</span>
            </div>
        </div>
        <div class="ad-info">
            <div class="ad-info__column">
                <svg xmlns="http://www.w3.org/2000/svg" width="1.2962962962962963vh" height="1.2052777777777777vh" viewBox="0 0 14 13.017" > <path id="like-svgrepo-com" d="M13.977,4.443A3.968,3.968,0,0,0,10.188.562,3.766,3.766,0,0,0,6.961,2.421,3.63,3.63,0,0,0,3.812.562,3.968,3.968,0,0,0,.023,4.443,4,4,0,0,0,.142,5.918,6.326,6.326,0,0,0,2.081,9.153l4.877,4.426,4.961-4.426a6.327,6.327,0,0,0,1.938-3.235A4.011,4.011,0,0,0,13.977,4.443Z" transform="translate(0 -0.562)" fill="#101010" ></path> </svg> 
                {data.favourites}
            </div>
            <div class="ad-info__column">
                <svg xmlns="http://www.w3.org/2000/svg" width="1.2962962962962963vh" height="0.837962962962963vh" viewBox="0 0 14 9.05" > <g id="view" transform="translate(0 -2.475)"> <circle id="Эллипс_706" data-name="Эллипс 706" cx="2.155" cy="2.155" r="2.155" transform="translate(4.845 4.846)" fill="#101010" ></circle> <path id="Контур_12633" data-name="Контур 12633" d="M13.785,6.4C12.129,4.4,9.621,2.475,7,2.475S1.87,4.4.215,6.4a.937.937,0,0,0,0,1.194A14.031,14.031,0,0,0,2.669,9.921c2.935,2.137,5.72,2.142,8.662,0A14.03,14.03,0,0,0,13.785,7.6.937.937,0,0,0,13.785,6.4ZM7,3.984A3.017,3.017,0,1,1,3.983,7,3.021,3.021,0,0,1,7,3.984Z" fill="#101010" ></path> </g> </svg> 
                {data.views}
            </div>
        </div>
    </div>
</button>