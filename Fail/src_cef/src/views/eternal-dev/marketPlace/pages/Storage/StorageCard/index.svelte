<script>
    import { getPicture } from "../../../modules/picture";
    import { getName, getSubname } from "../../../modules/formats";

    import "./style.scss";
    import { itemsInfo, ItemType } from "../../../../../../json/itemsInfo";
    import { formatThousands } from "../../../modules/money";
    import { unloadLot } from "../../../modules/functions";
    
    export let data;
    export let type;
    export let onClick;

    const click = () => {
        if (onClick != null)
            onClick();
    };

    const onClick_unload = () => {
        if (["item", "clothes"].includes(data.type))
            return;
        
        unloadLot(data.id);
    };
</script>

<button on:click={click} class="storage-card">
    <div class={ `storage-card__header storage-card__header-${data.type}`}>
        <div class="storage-card__header__badges">
            {#if data.type == "item"}
                <div class="badge">
                    <svg id="box" xmlns="http://www.w3.org/2000/svg" width="1.2962962962962963vh" height="1.2867592592592592vh" viewBox="0 0 14 13.897" > <path id="Контур_12670" data-name="Контур 12670" fill="none" ></path> <path id="Контур_12671" data-name="Контур 12671" fill="none" ></path> <path id="Контур_12672" data-name="Контур 12672" d="M6.479,6.483.19,3.835A.137.137,0,0,0,0,3.961v7.079a.437.437,0,0,0,.275.406l6.1,2.44a.137.137,0,0,0,.187-.127V6.609a.137.137,0,0,0-.084-.126Z" fill="#3d82d5" ></path> <path id="Контур_12673" data-name="Контур 12673" d="M7.053,5.731l6.079-2.56a.137.137,0,0,0,0-.25L7.185.144a.438.438,0,0,0-.37,0L.863,2.922a.137.137,0,0,0,0,.25l6.079,2.56a.137.137,0,0,0,.106,0Z" fill="#3d82d5" ></path> <path id="Контур_12674" data-name="Контур 12674" d="M7.438,6.609V13.76a.137.137,0,0,0,.187.127l6.1-2.44A.438.438,0,0,0,14,11.041V3.961a.137.137,0,0,0-.19-.126L7.521,6.483a.137.137,0,0,0-.084.126Z" fill="#3d82d5" ></path> </svg> 
                    { data.params.count } шт.
                </div>
            {/if}

            {#if data.type == "vehicle"}
                <div class="badge">
                    <svg id="highway" xmlns="http://www.w3.org/2000/svg" width="1.2962962962962963vh" height="1.2962962962962963vh" viewBox="0 0 14 14"> <path id="Контур_12625" data-name="Контур 12625" d="M13.59,5.77H.41a.41.41,0,0,0,0,.82H.82V7.82a.41.41,0,0,0,.82,0V6.59H12.359V7.82a.41.41,0,0,0,.82,0V6.59h.41a.41.41,0,0,0,0-.82Z" fill="#101010"></path> <path id="Контур_12626" data-name="Контур 12626" d="M9.488,0H7.82a.41.41,0,0,0-.41.41V4.949h3.341L9.891.334A.41.41,0,0,0,9.488,0Z" fill="#101010"></path> <path id="Контур_12627" data-name="Контур 12627" d="M12.265,13.852a.408.408,0,0,0,.087-.338l-1.139-6.1H7.41v6.18a.41.41,0,0,0,.41.41h4.129A.411.411,0,0,0,12.265,13.852Z" fill="#101010"></path> <path id="Контур_12628" data-name="Контур 12628" d="M6.18,14a.41.41,0,0,0,.41-.41V7.41h-3.8l-1.139,6.1a.41.41,0,0,0,.4.486Z" fill="#101010"></path> <path id="Контур_12629" data-name="Контур 12629" d="M4.512,0a.41.41,0,0,0-.4.334l-.86,4.615H6.59V.41A.41.41,0,0,0,6.18,0Z" fill="#101010"></path> </svg> 
                    { formatThousands(data.params.mileage) } км.
                </div>
            {/if}

            {#if data.type == "house"}
                <div class="badge">
                    <svg xmlns="http://www.w3.org/2000/svg" width="1.2962962962962963vh" height="1.2962962962962963vh" viewBox="0 0 14 14"> <path id="XMLID_356_" d="M4.821,10.714h7v1.5h-7Z" transform="translate(-1.321 -1.715)" fill="#101010"></path> <path id="XMLID_358_" d="M11.821,9.536h-7v-1.5h7Z" transform="translate(-1.321 -1.536)" fill="#101010"></path> <path id="XMLID_360_" d="M4.821,13.393h7v1.5h-7Z" transform="translate(-1.321 -1.893)" fill="#101010"></path> <path id="XMLID_362_" d="M15.071,5.071v9.5a.5.5,0,0,1-.5.5h-2v-8a.5.5,0,0,0-.5-.5h-8a.5.5,0,0,0-.5.5v8h-2a.5.5,0,0,1-.5-.5v-9.5a.5.5,0,0,1,.263-.44l6.5-3.5a.5.5,0,0,1,.473,0l6.5,3.5A.5.5,0,0,1,15.071,5.071Z" transform="translate(-1.071 -1.072)" fill="#101010"></path> </svg> 
                    {data.params.garages}
                </div>
            {/if}
        </div>

        <div class="storage-card__header__image" style={ `--background-image: url(${getPicture(data.type, data)});` }>
            
        </div>

        {#if data.type == "service"}
            <svg xmlns="http://www.w3.org/2000/svg" width="6.481481481481481vh" height="4.685740740740741vh" viewBox="0 0 70 50.606" class="create-hands-svg">
                <g id="hand-shake_1_" data-name="hand-shake (1)" transform="translate(0 -9.697)">
                    <path id="Контур_12685" data-name="Контур 12685" d="M70,15.972v21.19s-4.535.893-5.469,1.011-3.858,1.062-5.979-.977C55.28,34.061,43.659,22.5,43.659,22.5s-2-1.966-5.221-.267c-2.954,1.557-7.332,3.838-9.16,4.726a4.209,4.209,0,0,1-6.322-3.3c0-1.725,1.076-2.9,2.615-3.757,4.17-2.528,12.959-7.461,16.619-9.406,2.225-1.183,3.828-1.285,6.883,1.289,3.762,3.164,7.11,6.048,7.11,6.048a3.479,3.479,0,0,0,2.834.544C63.292,17.475,70,15.972,70,15.972Zm-46.258,35.9A3.7,3.7,0,0,0,19.3,46.759a3.818,3.818,0,0,0-.806-3.769,3.906,3.906,0,0,0-3.735-.945,3.815,3.815,0,0,0-.809-3.764,4.217,4.217,0,0,0-5.9.155c-1.726,1.657-2.832,4.658-1.291,6.424s3.306.688,4.653.381c-.375,1.337-1.5,2.58-.115,4.33s3.306.689,4.654.384c-.376,1.332-1.45,2.7-.12,4.322s3.54.76,4.992.309c-.56,1.44-1.76,2.993-.219,4.733s5.093.942,6.83-.715a4.141,4.141,0,0,0,.375-5.854A3.943,3.943,0,0,0,23.742,51.876ZM55.427,40.852c-12.553-12.553-6.649-6.646-13.4-13.416a4.4,4.4,0,0,0-4.706-.847c-1.878.823-4.3,1.945-6.117,2.8a10.093,10.093,0,0,1-4.114,1.369A6.979,6.979,0,0,1,23.4,17.84c2.789-1.93,9.21-5.345,9.21-5.345a8.059,8.059,0,0,0-6.241-2.479c-4.284,0-13.233,5.863-13.233,5.863a7,7,0,0,1-6.158.161L0,13.611V37.858s1.992.577,3.782,1.308a7.973,7.973,0,0,1,1.961-3.1c2.969-2.828,7.891-2.858,10.592-.076a6.684,6.684,0,0,1,1.672,2.969,6.764,6.764,0,0,1,2.867,1.748,6.67,6.67,0,0,1,1.674,2.964,6.82,6.82,0,0,1,4.637,5,6.862,6.862,0,0,1,2.991,1.793,7.055,7.055,0,0,1,1.851,6.112.011.011,0,0,1,.011,0c.027.035,1.006,1.127,1.617,1.742a3.077,3.077,0,0,0,4.352-4.352c-.043-.043-4.318-4.514-3.974-4.861s5.788,5.323,5.889,5.427a3.075,3.075,0,0,0,4.349-4.349c-.059-.056-.3-.291-.395-.384,0,0-5.4-4.811-4.989-5.222s7.124,5.846,7.135,5.846a3.037,3.037,0,0,0,4.375-4.2c-.021-.064-5.112-5.384-4.715-5.784s5.44,4.781,5.451,4.792a3.077,3.077,0,1,0,4.349-4.354C55.464,40.873,55.443,40.863,55.427,40.852Z" fill="#101010"></path>
                </g>
            </svg>
        {/if}
    </div>
    <div class="storage-card__content">
        <div class="title">{ getName(data) }</div>
        <div class="type">{ getSubname(data) }</div>
        {#if type == "inStorage"}
            <!-- <div class="state state-inStorage">
                Время хранения: 
                <span class="state-inStorage__time">19580д. 21ч.</span>
            </div> -->
            <button on:click={() => onClick_unload()} class="returnFromStorage-button" class:active={["item", "clothes"].includes(data.type)}>
                { ["item", "clothes"].includes(data.type) ? "Выгрузка недоступна с планшета" : "Выгрузить со склада" }
            </button>
        {/if}

        {#if type == "create"}
            {#if (data.type == "service" || data.onEstate)}
                <div class="state state-available">
                    { data.type == "service" ? "Доступно" : "В собственности" }
                </div>
            {:else}
                <div class="state state-inStorage">
                    На складе
                </div>
            {/if}
        {/if}
    </div>
</button>
