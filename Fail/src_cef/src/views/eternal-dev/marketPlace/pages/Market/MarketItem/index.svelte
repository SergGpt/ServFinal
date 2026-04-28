<script>
    import { countMoneyToDollar, formatThousands } from "../../../modules/money";
    import { getPicture } from "../../../modules/picture";
    import { getName, getSubname, inFavourite } from "../../../modules/formats";
    import { setFavourite } from "../../../modules/functions";

    export let data;
    export let onClick;

    let pictures = []

    let selectedPicture = 0,
        currentPicture = pictures[selectedPicture];

    const onHover = (index) => {
        selectedPicture = index;
    }

    const onLeave = () => {
        selectedPicture = 0;
    }

    const onFavorite = () => {
        setFavourite(data);
    }

    $: pictures = [
        getPicture(data.type, data), 
        ...(data.photos || [])
    ].filter(x => x != null);

    $: currentPicture = pictures[selectedPicture];
</script>

<button on:click={(e) => !e.target.className.includes("favorite-button") && onClick()} class={ `market-card ${data.type}` }>
    <div class="market-card__header market-card__header-business">
        <div class="market-card__header-image" style={ `--background-image: url(${currentPicture});` } ></div>
        <!-- <div class="market-card__more-images" >
            <svg xmlns="http://www.w3.org/2000/svg" width="3.7037037037037033vh" height="3.395185185185185vh" viewBox="0 0 40 36.668" > <g id="Сгруппировать_3612" data-name="Сгруппировать 3612" transform="translate(0 -0.038)" > <path id="Контур_12634" data-name="Контур 12634" d="M15,11.706a3.334,3.334,0,1,0-3.334-3.334A3.337,3.337,0,0,0,15,11.706Zm0,0" fill="#fcfcfc" ></path> <g id="Сгруппировать_3611" data-name="Сгруппировать 3611" > <path id="Контур_12633" data-name="Контур 12633" d="M10.416,29.206a6.241,6.241,0,0,1-5.9-4.252l-.058-.192a6.083,6.083,0,0,1-.288-1.807V11.592L.122,25.089a3.785,3.785,0,0,0,2.653,4.592l25.772,6.9a3.823,3.823,0,0,0,.96.123,3.716,3.716,0,0,0,3.6-2.725l1.5-4.775Zm0,0" fill="#fcfcfc" ></path> <path id="Контур_12635" data-name="Контур 12635" d="M35.833.038h-25A4.173,4.173,0,0,0,6.666,4.205V22.539a4.173,4.173,0,0,0,4.167,4.167h25A4.173,4.173,0,0,0,40,22.539V4.205A4.173,4.173,0,0,0,35.833.038Zm-25,3.334h25a.834.834,0,0,1,.833.833V16.037L31.4,9.894a2.985,2.985,0,0,0-2.235-1.025A2.913,2.913,0,0,0,26.94,9.921l-6.19,7.43-2.017-2.012a2.926,2.926,0,0,0-4.133,0l-4.6,4.6V4.205A.834.834,0,0,1,10.832,3.372Zm0,0" fill="#fcfcfc" ></path> </g> </g> </svg> 
            Еще -3 фотографий
        </div> -->

        {#if pictures.length == 0}
            <svg xmlns="http://www.w3.org/2000/svg" width="6.481481481481481vh" height="4.685740740740741vh" viewBox="0 0 70 50.606" class="create-hands-svg">
                <g id="hand-shake_1_" data-name="hand-shake (1)" transform="translate(0 -9.697)">
                    <path id="Контур_12685" data-name="Контур 12685" d="M70,15.972v21.19s-4.535.893-5.469,1.011-3.858,1.062-5.979-.977C55.28,34.061,43.659,22.5,43.659,22.5s-2-1.966-5.221-.267c-2.954,1.557-7.332,3.838-9.16,4.726a4.209,4.209,0,0,1-6.322-3.3c0-1.725,1.076-2.9,2.615-3.757,4.17-2.528,12.959-7.461,16.619-9.406,2.225-1.183,3.828-1.285,6.883,1.289,3.762,3.164,7.11,6.048,7.11,6.048a3.479,3.479,0,0,0,2.834.544C63.292,17.475,70,15.972,70,15.972Zm-46.258,35.9A3.7,3.7,0,0,0,19.3,46.759a3.818,3.818,0,0,0-.806-3.769,3.906,3.906,0,0,0-3.735-.945,3.815,3.815,0,0,0-.809-3.764,4.217,4.217,0,0,0-5.9.155c-1.726,1.657-2.832,4.658-1.291,6.424s3.306.688,4.653.381c-.375,1.337-1.5,2.58-.115,4.33s3.306.689,4.654.384c-.376,1.332-1.45,2.7-.12,4.322s3.54.76,4.992.309c-.56,1.44-1.76,2.993-.219,4.733s5.093.942,6.83-.715a4.141,4.141,0,0,0,.375-5.854A3.943,3.943,0,0,0,23.742,51.876ZM55.427,40.852c-12.553-12.553-6.649-6.646-13.4-13.416a4.4,4.4,0,0,0-4.706-.847c-1.878.823-4.3,1.945-6.117,2.8a10.093,10.093,0,0,1-4.114,1.369A6.979,6.979,0,0,1,23.4,17.84c2.789-1.93,9.21-5.345,9.21-5.345a8.059,8.059,0,0,0-6.241-2.479c-4.284,0-13.233,5.863-13.233,5.863a7,7,0,0,1-6.158.161L0,13.611V37.858s1.992.577,3.782,1.308a7.973,7.973,0,0,1,1.961-3.1c2.969-2.828,7.891-2.858,10.592-.076a6.684,6.684,0,0,1,1.672,2.969,6.764,6.764,0,0,1,2.867,1.748,6.67,6.67,0,0,1,1.674,2.964,6.82,6.82,0,0,1,4.637,5,6.862,6.862,0,0,1,2.991,1.793,7.055,7.055,0,0,1,1.851,6.112.011.011,0,0,1,.011,0c.027.035,1.006,1.127,1.617,1.742a3.077,3.077,0,0,0,4.352-4.352c-.043-.043-4.318-4.514-3.974-4.861s5.788,5.323,5.889,5.427a3.075,3.075,0,0,0,4.349-4.349c-.059-.056-.3-.291-.395-.384,0,0-5.4-4.811-4.989-5.222s7.124,5.846,7.135,5.846a3.037,3.037,0,0,0,4.375-4.2c-.021-.064-5.112-5.384-4.715-5.784s5.44,4.781,5.451,4.792a3.077,3.077,0,1,0,4.349-4.354C55.464,40.873,55.443,40.863,55.427,40.852Z" fill="#101010"></path>
                </g>
            </svg>
        {/if}

        {#if pictures.length > 1}
            <div class="market-card__image-sections">
                {#each pictures as item, index }
                    <!-- svelte-ignore a11y-no-static-element-interactions -->
                    <!-- svelte-ignore a11y-mouse-events-have-key-events -->
                    <div on:mouseover={() => onHover(index)} on:mouseleave={onLeave} class="image-section">
                        <div class="image-section__bottom-line"></div>
                    </div>
                {/each}
            </div>
        {/if}
        
        <button on:click={() => onFavorite()} class:active={ inFavourite(data) } class="favorite-button">
            <svg xmlns="http://www.w3.org/2000/svg" width="1.2962962962962963vh" height="1.2052777777777777vh" viewBox="0 0 14 13.017" > <path id="like-svgrepo-com" d="M13.977,4.443A3.968,3.968,0,0,0,10.188.562,3.766,3.766,0,0,0,6.961,2.421,3.63,3.63,0,0,0,3.812.562,3.968,3.968,0,0,0,.023,4.443,4,4,0,0,0,.142,5.918,6.326,6.326,0,0,0,2.081,9.153l4.877,4.426,4.961-4.426a6.327,6.327,0,0,0,1.938-3.235A4.011,4.011,0,0,0,13.977,4.443Z" transform="translate(0 -0.562)" fill="#101010" ></path> </svg>
        </button>

        <div class="market-card__header__badges"></div>
    </div>
    <div class="market-card__content">
        <div class="title row-block align-center justify-start" id="markerCard_undefined_title" >
            <div class="title__wrapper">
                <span class="title__text">{ getName(data) }</span>
            </div>
        </div>
        <div class="type">{ getSubname(data) }</div>
        <div class="price">
            {#if !data.minPrice || (data.type != "item" && data.type != "clothes")}
                <div class="animated-number">
                    <span>{ countMoneyToDollar(data.cost) }</span>
                </div>            
            {:else}
                <div class="column">
                    <div class="column__label">Цена от:</div>
                    <div class="column__value">{ countMoneyToDollar(data.minPrice) }</div>
                </div>
                <div class="column">
                    <div class="column__label">Кол-во:</div>
                    <div class="column__value">{ formatThousands(data.count) }</div>
                </div>
            {/if}
        </div>

        {#if data.type != "item" && data.type != "clothes"}
            <div class="ad-info">
                <div class="ad-info__column">
                    <svg xmlns="http://www.w3.org/2000/svg" width="1.2962962962962963vh" height="1.2052777777777777vh" viewBox="0 0 14 13.017" > <path id="like-svgrepo-com" d="M13.977,4.443A3.968,3.968,0,0,0,10.188.562,3.766,3.766,0,0,0,6.961,2.421,3.63,3.63,0,0,0,3.812.562,3.968,3.968,0,0,0,.023,4.443,4,4,0,0,0,.142,5.918,6.326,6.326,0,0,0,2.081,9.153l4.877,4.426,4.961-4.426a6.327,6.327,0,0,0,1.938-3.235A4.011,4.011,0,0,0,13.977,4.443Z" transform="translate(0 -0.562)" fill="#101010" ></path> </svg> 
                    { data.favourites }
                </div>
                <div class="ad-info__column">
                    <svg xmlns="http://www.w3.org/2000/svg" width="1.2962962962962963vh" height="0.837962962962963vh" viewBox="0 0 14 9.05" > <g id="view" transform="translate(0 -2.475)" > <circle id="Эллипс_706" data-name="Эллипс 706" cx="2.155" cy="2.155" r="2.155" transform="translate(4.845 4.846)" fill="#101010" ></circle> <path id="Контур_12633" data-name="Контур 12633" d="M13.785,6.4C12.129,4.4,9.621,2.475,7,2.475S1.87,4.4.215,6.4a.937.937,0,0,0,0,1.194A14.031,14.031,0,0,0,2.669,9.921c2.935,2.137,5.72,2.142,8.662,0A14.03,14.03,0,0,0,13.785,7.6.937.937,0,0,0,13.785,6.4ZM7,3.984A3.017,3.017,0,1,1,3.983,7,3.021,3.021,0,0,1,7,3.984Z" fill="#101010" ></path> </g> </svg> 
                    { data.views }
                </div>
            </div>
        {/if}
    </div>
</button>