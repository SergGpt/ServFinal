<script>
    import UserInfo from "../../../components/UserInfo/index.svelte";
    import BusinessInfo from "../../../components/BusinessInfo/index.svelte";
    import VehicleInfo from "../../../components/VehicleInfo/index.svelte";
    import ItemCard from "../ItemCard/index.svelte";
    import CreateCard from "../../Create/CreateCard/index.svelte";

    import InfoModal from "../../../modals/InfoModal/index.svelte";
    import BuyModal from "../../../modals/BuyModal/index.svelte";
    import ProlongModal from "../../../modals/ProlongModal/index.svelte";

    import { countMoneyToDollar, formatThousands } from "../../../modules/money";
    import { getName, getType, inFavourite } from "../../../modules/formats";
    import { getPicture } from "../../../modules/picture";
    import { calculateDateDifference, convertMilesecondsToString, convertSecondsToString } from "../../../modules/time";
    import { buyLot, deleteLot, marketContactAuthor, marketLotActions, marketProlong, setFavourite, setModalState } from "../../../modules/functions";

    import { serverTime } from "store/server";
    import { charUUID } from "store/chars";

    import "./style.scss";

    export let backFunction;
    export let data;

    const pictures = [
        getPicture(data.type, data),
        ...(data.photos || [])
    ];

    let selectedPicture = 0,
        currentPicture = pictures[selectedPicture];

    const onHover = (index) => {
        selectedPicture = index;
    };

    const onLeave = () => {
        selectedPicture = 0;
    };

    const onTestdrive = () => {
        marketLotActions("testdrive", data.id);
    };

    const setWaypoint = () => {
        marketLotActions("waypoint", data.id, data.params.position.x, data.params.position.y);
    };

    const onClick_deleteLot = () => {
        backFunction();
        deleteLot(data.id);
        setModal(null);
    };

    const onClick_buy = (count, paymentType) => {
        buyLot(data.id, count, paymentType);
        setModal(null);
    };

    const onClick_prolong = (hours, paymentType) => {
        marketProlong(data.id, hours, paymentType);
        setModal(null);
    };

    let inEditing = false,
        modal = null;

    const onFavorite = () => {
        setFavourite(data);
    }

    const setModal = (modalName) => {
        modal = modalName;
        setModalState(modalName);
    }

    $: currentPicture = pictures[selectedPicture];
</script>

{#if inEditing}
    <CreateCard data={data} backFunction={() => inEditing = false} isEditing={true} />
{:else}
    {#if modal != null}
        {#if modal == "remove"}
            <InfoModal type={modal} callback={onClick_deleteLot} setModal={setModal} />
        {:else if modal == "prolong"}
            <ProlongModal type={modal} data={data} callback={onClick_prolong} setModal={setModal} />
        {:else if modal == "buy"}
            <BuyModal type={modal} data={data} callback={onClick_buy} setModal={setModal} />
        {/if}

    {/if}

    {#if data.type == "item" || data.type == "clothes"}
        <ItemCard data={data} backFunction={backFunction} />
    {:else}
        <div class={ `page-data market ${data.type}` }>
            <div class="header">
                <div class="header__content">
                    <div class="back-container">
                        <button on:click={() => backFunction()} class="back-container__button" >
                            <svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="1.2962962962962963vh" height="1.2962962962962963vh" viewBox="0 0 14 14" > <defs> <clipPath id="clip-path"> <rect id="Прямоугольник_4874" data-name="Прямоугольник 4874" width="14" height="14" transform="translate(43.58 12.58)" fill="#101010" ></rect> </clipPath> </defs> <g id="Группа_масок_22" data-name="Группа масок 22" transform="translate(-43.58 -12.58)" opacity="0.5" > <path id="Контур_12569" data-name="Контур 12569" d="M55.613,21.044h-12" transform="translate(1.966 -1.465)" fill="none" stroke="#101010" stroke-width="2" ></path> <path id="Контур_12570" data-name="Контур 12570" d="M48.814,12.58l-5,5,5,5" transform="translate(1.766 2)" fill="none" stroke="#101010" stroke-width="2" ></path> </g> </svg>
                        </button>
                        Вернуться назад
                    </div>
                </div>

                <UserInfo />
            </div>

            <div class="content">
                <div class="left-side">
                    <div class="left-side__header">
                        <button on:click={() => onFavorite()} class:active={inFavourite(data)} class="header-button">
                            <svg xmlns="http://www.w3.org/2000/svg" width="1.2962962962962963vh" height="1.2052777777777777vh" viewBox="0 0 14 13.017" > <path id="like-svgrepo-com" d="M13.977,4.443A3.968,3.968,0,0,0,10.188.562,3.766,3.766,0,0,0,6.961,2.421,3.63,3.63,0,0,0,3.812.562,3.968,3.968,0,0,0,.023,4.443,4,4,0,0,0,.142,5.918,6.326,6.326,0,0,0,2.081,9.153l4.877,4.426,4.961-4.426a6.327,6.327,0,0,0,1.938-3.235A4.011,4.011,0,0,0,13.977,4.443Z" transform="translate(0 -0.562)" fill="#101010" ></path> </svg>
                        </button>
                        {#if data.type == "house" || data.type == "business"}
                            <button on:click={() => setWaypoint()} class="header-button map">
                                <svg xmlns="http://www.w3.org/2000/svg" width="1.3021296296296296vh" height="1.4814814814814814vh" viewBox="0 0 14.063 16"> <g id="location" transform="translate(-0.969)"> <g id="Сгруппировать_3537" data-name="Сгруппировать 3537"> <g id="Сгруппировать_3536" data-name="Сгруппировать 3536"> <path id="Контур_12623" data-name="Контур 12623" d="M8,0A5.154,5.154,0,0,0,3.809,8.156l3.8,5.924a.469.469,0,0,0,.789,0l3.813-5.945A5.156,5.156,0,0,0,8,0ZM8,7.5a2.344,2.344,0,1,1,2.344-2.344A2.346,2.346,0,0,1,8,7.5Z" fill="#fcfcfc"></path> </g> </g> <g id="Сгруппировать_3539" data-name="Сгруппировать 3539"> <g id="Сгруппировать_3538" data-name="Сгруппировать 3538"> <path id="Контур_12624" data-name="Контур 12624" d="M11.665,10.772,9.3,14.462a1.55,1.55,0,0,1-2.609,0l-2.364-3.69c-2.08.481-3.362,1.362-3.362,2.415C.969,15.014,4.592,16,8,16s7.031-.986,7.031-2.812C15.031,12.134,13.747,11.252,11.665,10.772Z" fill="#fcfcfc"></path> </g> </g> </g> </svg>
                            </button>
                        {/if}
                        <div class="item-info__pictures">
                            <div class="item-info__pictures__main" style="background-image: url({currentPicture});" >
                                {#if data.type == "service" && currentPicture == null}
                                    <svg xmlns="http://www.w3.org/2000/svg" width="6.481481481481481vh" height="4.685740740740741vh" viewBox="0 0 70 50.606" class="create-hands-svg">
                                        <g id="hand-shake_1_" data-name="hand-shake (1)" transform="translate(0 -9.697)">
                                            <path id="Контур_12685" data-name="Контур 12685" d="M70,15.972v21.19s-4.535.893-5.469,1.011-3.858,1.062-5.979-.977C55.28,34.061,43.659,22.5,43.659,22.5s-2-1.966-5.221-.267c-2.954,1.557-7.332,3.838-9.16,4.726a4.209,4.209,0,0,1-6.322-3.3c0-1.725,1.076-2.9,2.615-3.757,4.17-2.528,12.959-7.461,16.619-9.406,2.225-1.183,3.828-1.285,6.883,1.289,3.762,3.164,7.11,6.048,7.11,6.048a3.479,3.479,0,0,0,2.834.544C63.292,17.475,70,15.972,70,15.972Zm-46.258,35.9A3.7,3.7,0,0,0,19.3,46.759a3.818,3.818,0,0,0-.806-3.769,3.906,3.906,0,0,0-3.735-.945,3.815,3.815,0,0,0-.809-3.764,4.217,4.217,0,0,0-5.9.155c-1.726,1.657-2.832,4.658-1.291,6.424s3.306.688,4.653.381c-.375,1.337-1.5,2.58-.115,4.33s3.306.689,4.654.384c-.376,1.332-1.45,2.7-.12,4.322s3.54.76,4.992.309c-.56,1.44-1.76,2.993-.219,4.733s5.093.942,6.83-.715a4.141,4.141,0,0,0,.375-5.854A3.943,3.943,0,0,0,23.742,51.876ZM55.427,40.852c-12.553-12.553-6.649-6.646-13.4-13.416a4.4,4.4,0,0,0-4.706-.847c-1.878.823-4.3,1.945-6.117,2.8a10.093,10.093,0,0,1-4.114,1.369A6.979,6.979,0,0,1,23.4,17.84c2.789-1.93,9.21-5.345,9.21-5.345a8.059,8.059,0,0,0-6.241-2.479c-4.284,0-13.233,5.863-13.233,5.863a7,7,0,0,1-6.158.161L0,13.611V37.858s1.992.577,3.782,1.308a7.973,7.973,0,0,1,1.961-3.1c2.969-2.828,7.891-2.858,10.592-.076a6.684,6.684,0,0,1,1.672,2.969,6.764,6.764,0,0,1,2.867,1.748,6.67,6.67,0,0,1,1.674,2.964,6.82,6.82,0,0,1,4.637,5,6.862,6.862,0,0,1,2.991,1.793,7.055,7.055,0,0,1,1.851,6.112.011.011,0,0,1,.011,0c.027.035,1.006,1.127,1.617,1.742a3.077,3.077,0,0,0,4.352-4.352c-.043-.043-4.318-4.514-3.974-4.861s5.788,5.323,5.889,5.427a3.075,3.075,0,0,0,4.349-4.349c-.059-.056-.3-.291-.395-.384,0,0-5.4-4.811-4.989-5.222s7.124,5.846,7.135,5.846a3.037,3.037,0,0,0,4.375-4.2c-.021-.064-5.112-5.384-4.715-5.784s5.44,4.781,5.451,4.792a3.077,3.077,0,1,0,4.349-4.354C55.464,40.873,55.443,40.863,55.427,40.852Z" fill="#101010"></path>
                                        </g>
                                    </svg>
                                {/if}
                            </div>
                        </div>
                    </div>
                    {#if pictures.length > 1}
                        <div class="item-info__pictures__others">
                            {#each pictures as item, index}
                                <!-- svelte-ignore a11y-no-static-element-interactions -->
                                <!-- svelte-ignore a11y-mouse-events-have-key-events -->
                                <div
                                    on:mouseover={() => onHover(index)}
                                    on:mouseleave={onLeave}
                                    class="other-picture"
                                    class:selected={index == selectedPicture}
                                    style={`background-image: url(${item});`}
                                ></div>
                            {/each}
                        </div>
                    {/if}
                    <div class="item-info__content">
                        <div class="item-info__content__comment">
                            <div class="comment__label">Комментарий продавца:</div>
                            <div class="comment__value">{ data.comment }</div>
                        </div>
                        <div class="adv-button__container">
                            {#if data.type == "vehicle"}
                                <button on:click={() => onTestdrive()} class="adv__button test-drive">
                                    <svg id="steering-wheel" xmlns="http://www.w3.org/2000/svg" width="1.2962962962962963vh" height="1.2962962962962963vh" viewBox="0 0 14 14"> <circle id="Эллипс_710" data-name="Эллипс 710" cx="0.41" cy="0.41" r="0.41" transform="translate(6.59 7)" fill="#fcfcfc"></circle> <path id="Контур_12718" data-name="Контур 12718" d="M7,0a7,7,0,1,0,7,7A7.015,7.015,0,0,0,7,0ZM7,1.668A5.34,5.34,0,0,1,12.269,6.18H10.847A3.224,3.224,0,0,1,8.5,5.187a2.052,2.052,0,0,0-2.991,0,3.224,3.224,0,0,1-2.351.993H1.731A5.34,5.34,0,0,1,7,1.668ZM7,8.641A1.23,1.23,0,1,1,8.23,7.41,1.232,1.232,0,0,1,7,8.641Zm-4.965.3a3.238,3.238,0,0,1,1.274-.3,2.463,2.463,0,0,1,2.433,2.83h0a2.453,2.453,0,0,1-.194.66A5.357,5.357,0,0,1,2.035,8.944Zm6.419,3.186a2.446,2.446,0,0,1-.195-.66h0a2.464,2.464,0,0,1,3.017-2.76,5.992,5.992,0,0,1,.689.234A5.357,5.357,0,0,1,8.454,12.131Z" fill="#fcfcfc"></path> </svg> 
                                    Тест-драйв транспорта
                                </button>
                            {/if}
                        </div>
                    </div>
                </div>

                <div class="right-side">
                    <div class="table-info">
                        <div class="title">
                            { getName(data) }
                            <div class="price">{countMoneyToDollar(data.cost)}</div>
                        </div>
                        {#if data.type == "vehicle"}
                            <div class="badges">
                                <div class="badge mileage">
                                    <svg id="highway" xmlns="http://www.w3.org/2000/svg" width="1.2962962962962963vh" height="1.2962962962962963vh" viewBox="0 0 14 14"> <path id="Контур_12625" data-name="Контур 12625" d="M13.59,5.77H.41a.41.41,0,0,0,0,.82H.82V7.82a.41.41,0,0,0,.82,0V6.59H12.359V7.82a.41.41,0,0,0,.82,0V6.59h.41a.41.41,0,0,0,0-.82Z" fill="#101010"></path> <path id="Контур_12626" data-name="Контур 12626" d="M9.488,0H7.82a.41.41,0,0,0-.41.41V4.949h3.341L9.891.334A.41.41,0,0,0,9.488,0Z" fill="#101010"></path> <path id="Контур_12627" data-name="Контур 12627" d="M12.265,13.852a.408.408,0,0,0,.087-.338l-1.139-6.1H7.41v6.18a.41.41,0,0,0,.41.41h4.129A.411.411,0,0,0,12.265,13.852Z" fill="#101010"></path> <path id="Контур_12628" data-name="Контур 12628" d="M6.18,14a.41.41,0,0,0,.41-.41V7.41h-3.8l-1.139,6.1a.41.41,0,0,0,.4.486Z" fill="#101010"></path> <path id="Контур_12629" data-name="Контур 12629" d="M4.512,0a.41.41,0,0,0-.4.334l-.86,4.615H6.59V.41A.41.41,0,0,0,6.18,0Z" fill="#101010"></path> </svg> 
                                    { formatThousands(data.params.mileage) } км.
                                </div>
                                <div class="badge kg">
                                    { formatThousands(data.params.capacity) }
                                    <svg xmlns="http://www.w3.org/2000/svg" width="1.2962962962962963vh" height="1.2962962962962963vh" viewBox="0 0 14 14" class="kg"> <g id="Сгруппировать_1769" data-name="Сгруппировать 1769" transform="translate(-1 -1)"> <rect id="Прямоугольник_11" data-name="Прямоугольник 11" width="14" height="14" rx="4" transform="translate(1 1)" fill="#0f0f0f" opacity="0.34"></rect> <path id="Контур_9727" data-name="Контур 9727" d="M5.638-1.356H4.058l-1.54-2.61-.47.74v1.87H.708v-6.67h1.34V-5l1.88-3.03h1.56l-2.13,3.14Zm2.79.12a2.509,2.509,0,0,1-2.045-.95,3.831,3.831,0,0,1-.775-2.5,3.827,3.827,0,0,1,.775-2.505,2.514,2.514,0,0,1,2.045-.945,2.179,2.179,0,0,1,1.365.425,2.772,2.772,0,0,1,.855,1.105l-1.09.51a1.216,1.216,0,0,0-1.13-.85,1.2,1.2,0,0,0-1.045.6,3,3,0,0,0-.4,1.66,3,3,0,0,0,.4,1.66,1.2,1.2,0,0,0,1.045.6,1.289,1.289,0,0,0,1.01-.4v-1.01H8.188v-1.18h2.52V-2.3A2.862,2.862,0,0,1,8.428-1.236Z" transform="translate(2.292 12.686)" fill="#fbfbfb"></path> </g> </svg>
                                </div>
                                <div class="gas-type">
                                    <svg xmlns="http://www.w3.org/2000/svg" width="1.3888888888888888vh" height="1.6666666666666665vh" viewBox="0 0 15 18" class="gas-type__icon"> <g id="gas-station" transform="translate(-1.5)"> <g id="Сгруппировать_1643" data-name="Сгруппировать 1643"> <path id="Контур_9457" data-name="Контур 9457" d="M16.39,2.36,14.89.86a.375.375,0,0,0-.53.53l1.235,1.235L14.36,3.86a.375.375,0,0,0-.11.265V5.25a1.5,1.5,0,0,0,1.5,1.5v6.375a.375.375,0,0,1-.75,0v-.75a1.126,1.126,0,0,0-1.125-1.125H13.5V1.5A1.5,1.5,0,0,0,12,0H4.5A1.5,1.5,0,0,0,3,1.5V15a1.5,1.5,0,0,0-1.5,1.5v1.125A.375.375,0,0,0,1.875,18h12.75A.375.375,0,0,0,15,17.625V16.5A1.5,1.5,0,0,0,13.5,15V12h.375a.375.375,0,0,1,.375.375v.75a1.125,1.125,0,0,0,2.25,0V2.625A.375.375,0,0,0,16.39,2.36ZM12,6.382a.375.375,0,0,1-.375.375H4.875A.375.375,0,0,1,4.5,6.382V1.875A.375.375,0,0,1,4.875,1.5h6.75A.375.375,0,0,1,12,1.875Z" fill="#1e2124"></path> </g> </g> </svg>
                                    <div class="gas-type__badge gas-type__badge-{data.params.gas.toLowerCase()}">{ data.params.gas }</div>
                                </div>
                                <div class="gov-price">
                                    <div class="gov-price__label">Гос. цена: </div>
                                    <div class="gov-price__value">{ countMoneyToDollar(data.params.cost) }</div>
                                </div>
                            </div>
                        {:else if data.type == "house"}
                            <div class="badges house">
                                <div class="badge">
                                    <svg xmlns="http://www.w3.org/2000/svg" width="1.2962962962962963vh" height="1.0909259259259259vh" viewBox="0 0 14 11.782"> <g id="multiple-users-silhouette" transform="translate(0 -1.03)"> <path id="Контур_12568" data-name="Контур 12568" d="M8.448,3.052a2.544,2.544,0,0,1,1.184,1.89,2.052,2.052,0,1,0-1.184-1.89ZM7.1,7.256A2.053,2.053,0,1,0,5.05,5.2,2.053,2.053,0,0,0,7.1,7.256Zm.871.14H6.232A2.632,2.632,0,0,0,3.6,10.025v2.131l.005.033.147.046a11.967,11.967,0,0,0,3.575.576,7.338,7.338,0,0,0,3.121-.586l.137-.069H10.6V10.025A2.631,2.631,0,0,0,7.974,7.4Zm3.4-2.12H9.642a2.53,2.53,0,0,1-.781,1.763,3.124,3.124,0,0,1,2.231,2.989v.657a7.075,7.075,0,0,0,2.755-.579l.137-.07H14V7.905A2.632,2.632,0,0,0,11.371,5.276ZM3.5,5.137A2.04,2.04,0,0,0,4.592,4.82,2.541,2.541,0,0,1,5.548,3.2c0-.038.006-.077.006-.115A2.053,2.053,0,1,0,3.5,5.137Zm1.844,1.9a2.532,2.532,0,0,1-.78-1.753c-.064,0-.128-.01-.193-.01H2.629A2.632,2.632,0,0,0,0,7.905v2.131l.005.033.147.046a12.326,12.326,0,0,0,2.961.556v-.643A3.124,3.124,0,0,1,5.344,7.039Z" fill="#3d82d5"></path> </g> </svg> 
                                    { data.params.people }
                                </div>
                                <div class="badge">
                                    <svg xmlns="http://www.w3.org/2000/svg" width="1.2962962962962963vh" height="1.2962962962962963vh" viewBox="0 0 14 14"> <path id="XMLID_356_" d="M4.821,10.714h7v1.5h-7Z" transform="translate(-1.321 -1.715)" fill="#101010"></path> <path id="XMLID_358_" d="M11.821,9.536h-7v-1.5h7Z" transform="translate(-1.321 -1.536)" fill="#101010"></path> <path id="XMLID_360_" d="M4.821,13.393h7v1.5h-7Z" transform="translate(-1.321 -1.893)" fill="#101010"></path> <path id="XMLID_362_" d="M15.071,5.071v9.5a.5.5,0,0,1-.5.5h-2v-8a.5.5,0,0,0-.5-.5h-8a.5.5,0,0,0-.5.5v8h-2a.5.5,0,0,1-.5-.5v-9.5a.5.5,0,0,1,.263-.44l6.5-3.5a.5.5,0,0,1,.473,0l6.5,3.5A.5.5,0,0,1,15.071,5.071Z" transform="translate(-1.071 -1.072)" fill="#101010"></path> </svg> 
                                    { data.params.garages }
                                </div>
                                <div class="gov-price">
                                    <div class="gov-price__label">Гос. цена: </div>
                                    <div class="gov-price__value">{ countMoneyToDollar(data.params.cost) }</div>
                                </div>
                            </div>
                        {:else}
                            <div class="additional-info__second-row first" >
                                <div class="column">
                                    <span class="additional-info__label">{ data.type == "service" ? "Тип" : "Тип имущества" }:</span>
                                    <span class="additional-info__value">{ getType(data.type) }</span>
                                </div>
                                <!---->
                                {#if data.type != "service"}
                                    <div class="gov-price">
                                        <div class="gov-price__label">Гос. цена:</div>
                                        <div class="gov-price__value">{ countMoneyToDollar(data.params.cost) }</div>
                                    </div>
                                {/if}
                            </div>
                        {/if}
                        <div class="additional-info">
                            <div class="additional-info__date">
                                <span class="additional-info__label">Дата объявления:</span>
                                <span class="additional-info__value">{ convertMilesecondsToString(data.createDate) }</span>
                                <div class="additional-info__counters" >
                                    <div class="counter">
                                        <svg xmlns="http://www.w3.org/2000/svg" width="1.2962962962962963vh" height="1.2052777777777777vh" viewBox="0 0 14 13.017" > <path id="like-svgrepo-com" d="M13.977,4.443A3.968,3.968,0,0,0,10.188.562,3.766,3.766,0,0,0,6.961,2.421,3.63,3.63,0,0,0,3.812.562,3.968,3.968,0,0,0,.023,4.443,4,4,0,0,0,.142,5.918,6.326,6.326,0,0,0,2.081,9.153l4.877,4.426,4.961-4.426a6.327,6.327,0,0,0,1.938-3.235A4.011,4.011,0,0,0,13.977,4.443Z" transform="translate(0 -0.562)" fill="#101010" ></path> </svg> 
                                        { data.favourites }
                                    </div>
                                    <div class="counter">
                                        <svg xmlns="http://www.w3.org/2000/svg" width="1.2962962962962963vh" height="0.837962962962963vh" viewBox="0 0 14 9.05" > <g id="view" transform="translate(0 -2.475)" > <circle id="Эллипс_706" data-name="Эллипс 706" cx="2.155" cy="2.155" r="2.155" transform="translate(4.845 4.846)" fill="#101010" ></circle> <path id="Контур_12633" data-name="Контур 12633" d="M13.785,6.4C12.129,4.4,9.621,2.475,7,2.475S1.87,4.4.215,6.4a.937.937,0,0,0,0,1.194A14.031,14.031,0,0,0,2.669,9.921c2.935,2.137,5.72,2.142,8.662,0A14.03,14.03,0,0,0,13.785,7.6.937.937,0,0,0,13.785,6.4ZM7,3.984A3.017,3.017,0,1,1,3.983,7,3.021,3.021,0,0,1,7,3.984Z" fill="#101010" ></path> </g> </svg> 
                                        { data.views }
                                    </div>
                                </div>
                            </div>
                            {#if data.type == "vehicle"}
                                <div class="additional-info__second-row">
                                    <div class="column">
                                        <span class="additional-info__label">Тип имущества:</span>
                                        <span class="additional-info__value">{ getType(data.type) }</span>
                                    </div>
                                </div>
                                <div class="additional-info__second-row">
                                    <div class="column">
                                        <span class="additional-info__label">Гос. номер:</span>
                                        <span class="additional-info__value">{ data.params.numberPlate }</span>
                                    </div>
                                    <div class="column">
                                        <span class="additional-info__label">Автосалон:</span>
                                        <span class="additional-info__value">{ data.params.motorShow }</span>
                                    </div>
                                </div>
                            {:else if (data.params.hasOwnProperty("area"))}
                                {#if data.type == "house"}
                                    <div class="additional-info__second-row">
                                        <div class="column">
                                            <span class="additional-info__label">Тип имущества:</span>
                                            <span class="additional-info__value">{ getType(data.type) }</span>
                                        </div>
                                    </div>
                                {/if}
                                <div class="additional-info__second-row">
                                    <div class="column">
                                        <span class="additional-info__label">Район:</span>
                                        <span class="additional-info__value">{ data.params.area }</span>
                                    </div>
                                </div>
                            {/if}
                        </div>
                        <div class="author-interaction">
                            {#if data.author.id != $charUUID}
                                {#if data.type != "service"}
                                    <button on:click={() => setModal("buy")} class="author-interaction__button">
                                        <svg id="coin" xmlns="http://www.w3.org/2000/svg" width="1.2962962962962963vh" height="1.2962962962962963vh" viewBox="0 0 14 14" > <g id="Сгруппировать_3567" data-name="Сгруппировать 3567" > <g id="Сгруппировать_3566" data-name="Сгруппировать 3566" > <path id="Контур_12655" data-name="Контур 12655" d="M7,0a7,7,0,1,0,7,7A7,7,0,0,0,7,0ZM9.011,9.76a2.252,2.252,0,0,1-1.167.749.325.325,0,0,0-.282.372c.009.207,0,.412,0,.619a.256.256,0,0,1-.277.288c-.118,0-.236.006-.354.006s-.207,0-.311,0a.268.268,0,0,1-.288-.305c0-.15,0-.3,0-.452,0-.334-.014-.346-.334-.4A4.246,4.246,0,0,1,4.8,10.3c-.294-.144-.326-.216-.242-.527.063-.23.127-.461.2-.688.052-.167.1-.242.19-.242a.5.5,0,0,1,.207.072A3.843,3.843,0,0,0,6.479,9.3a2.114,2.114,0,0,0,.233.014,1.557,1.557,0,0,0,.631-.13A.671.671,0,0,0,7.5,8.011a2.1,2.1,0,0,0-.493-.288,11.532,11.532,0,0,1-1.348-.6A1.906,1.906,0,0,1,4.586,5.295,2.008,2.008,0,0,1,6.055,3.434c.36-.13.363-.127.363-.5,0-.127,0-.253,0-.383.009-.282.055-.331.337-.34h.328c.536,0,.536.023.539.6,0,.426,0,.426.426.493a3.751,3.751,0,0,1,.933.279.271.271,0,0,1,.176.363c-.075.259-.147.521-.228.778-.052.156-.1.228-.193.228a.463.463,0,0,1-.2-.06,2.945,2.945,0,0,0-1.3-.3c-.058,0-.118,0-.176.006a1.162,1.162,0,0,0-.395.081.559.559,0,0,0-.138,1,2.608,2.608,0,0,0,.642.36,11.583,11.583,0,0,1,1.172.53A2.108,2.108,0,0,1,9.011,9.76Z" fill="#fcfcfc" ></path> </g> </g> </svg> 
                                        Начать сделку
                                    </button>
                                {/if}

                                {#if data.author.phoneNumber != -1}
                                    <button on:click={() => marketContactAuthor("call", data.author.phoneNumber)} class="author-interaction__square-button first">
                                        <div class="tooltip">
                                            <div class="tooltip__arrow">
                                                <svg height="6" viewBox="0 0 13 6" width="13" xmlns="http://www.w3.org/2000/svg" ><path id="Многоугольник_8" d="M6.5,0,13,6H0Z" fill="#efefef" ></path></svg >
                                            </div>
                                            <div class="tooltip__text">
                                                Позвонить автору
                                            </div>
                                        </div>
                                        <svg xmlns="http://www.w3.org/2000/svg" width="1.6666666666666665vh" height="1.6666666666666665vh" viewBox="0 0 18 18" > <g id="telephone-call" transform="translate(-1.286 -1.286)" > <path id="Контур_12651" data-name="Контур 12651" d="M18.9,15.017c-.562-.471-3.857-2.558-4.4-2.462-.257.046-.454.265-.98.893a7.513,7.513,0,0,1-.8.866,6.915,6.915,0,0,1-1.526-.566A9.45,9.45,0,0,1,6.823,9.386,6.915,6.915,0,0,1,6.258,7.86a7.513,7.513,0,0,1,.866-.8c.627-.526.847-.722.893-.98.1-.549-1.993-3.843-2.462-4.4-.2-.233-.375-.389-.6-.389C4.287,1.286,1.286,5,1.286,5.477c0,.039.064,3.9,4.943,8.866,4.963,4.879,8.826,4.943,8.866,4.943.481,0,4.191-3,4.191-3.664,0-.229-.156-.408-.39-.6Z" fill="#3d82d5" ></path> <path id="Контур_12652" data-name="Контур 12652" d="M14.786,9.643h1.286A5.149,5.149,0,0,0,10.929,4.5V5.786A3.861,3.861,0,0,1,14.786,9.643Z" fill="#3d82d5" ></path> <path id="Контур_12653" data-name="Контур 12653" d="M18,9.643h1.286a8.367,8.367,0,0,0-8.357-8.357V2.571A7.08,7.08,0,0,1,18,9.643Z" fill="#3d82d5" ></path> </g> </svg>
                                    </button>
                                    <button on:click={() => marketContactAuthor("chat", data.author.phoneNumber)} class="author-interaction__square-button" >
                                        <div class="tooltip">
                                            <div class="tooltip__arrow">
                                                <svg height="6" viewBox="0 0 13 6" width="13" xmlns="http://www.w3.org/2000/svg" ><path id="Многоугольник_8" d="M6.5,0,13,6H0Z" fill="#efefef" ></path></svg>
                                            </div>
                                            <div class="tooltip__text">
                                                Написать SMS
                                            </div>
                                        </div>
                                        <svg xmlns="http://www.w3.org/2000/svg" width="1.6666666666666665vh" height="1.6666666666666665vh" viewBox="0 0 18 18" > <g id="_01" data-name="01" transform="translate(-1.8 -1.8)" > <path id="Контур_12656" data-name="Контур 12656" d="M15.3,1.8h-9A4.493,4.493,0,0,0,1.8,6.286v6.282a4.493,4.493,0,0,0,4.5,4.486h1.35a1.018,1.018,0,0,1,.72.359l1.35,1.795a1.281,1.281,0,0,0,2.16,0l1.35-1.795a.9.9,0,0,1,.72-.359H15.3a4.493,4.493,0,0,0,4.5-4.486V6.287A4.493,4.493,0,0,0,15.3,1.8ZM11.7,12.375H6.3a.675.675,0,1,1,0-1.35h5.4a.675.675,0,0,1,0,1.35Zm3.6-4.5h-9a.675.675,0,0,1,0-1.35h9a.675.675,0,1,1,0,1.35Z" fill="#3d82d5" ></path> </g> </svg>
                                    </button>
                                {/if}
                            {/if}

                            {#if data.author.phoneNumber != -1}
                                <div class="author-interaction__phone-number" >
                                    <div class="value">{ data.author.phoneNumber }</div>
                                    <div class="label">Тел. номер</div>
                                </div>
                            {/if}
                            
                            <div class="author-interaction__author">
                                <div class="author__avatar" style="background-image: url(https://cdn.majestic-files.com/img/avatars/male.svg);" >
                                    
                                </div>
                                <div class="author__data">
                                    <div class="author__data__name">
                                        { data.author.name.replace("_", " ") }
                                    </div>
                                    <div class="author__data__additional" >
                                        <div class="additional__static" >
                                            Static: { data.author.id }
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>

                        { #if data.type == "business" }<BusinessInfo businessId={data.params.id} />{/if}
                        { #if data.type == "vehicle" }<VehicleInfo data={data} />{/if}
                    </div>
                    <div class="button-container">
                        {#if data.author.id != $charUUID}
                        <div class="adv__button">
                            <svg xmlns="http://www.w3.org/2000/svg" width="1.2962962962962963vh" height="1.175462962962963vh" viewBox="0 0 14 12.695" > <g id="warning" transform="translate(0 -0.653)"> <path id="Контур_12662" data-name="Контур 12662" d="M13.72,10.2l-4.9-8.5a2.087,2.087,0,0,0-3.625,0L.282,10.2A2.1,2.1,0,0,0,2.1,13.347h9.8A2.108,2.108,0,0,0,13.72,10.2ZM7,11.463A.781.781,0,1,1,7,9.9a.781.781,0,0,1,0,1.562Zm.712-5.049c-.035.605-.072,1.207-.107,1.813-.017.2-.017.375-.017.568A.588.588,0,0,1,7,9.362a.575.575,0,0,1-.588-.55C6.36,7.869,6.305,6.944,6.253,6c-.017-.248-.035-.5-.055-.746A.848.848,0,0,1,6.8,4.4a.784.784,0,0,1,.908.444.931.931,0,0,1,.072.392C7.766,5.633,7.729,6.025,7.712,6.414Z" fill="#101010" ></path> </g> </svg> 
                            Пожаловаться на объявление
                        </div>
                        {:else}
                            <button on:click={() => inEditing = true} class="adv__button edit default">
                                <svg xmlns="http://www.w3.org/2000/svg" width="1.2962962962962963vh" height="1.2962962962962963vh" viewBox="0 0 14 14"> <g id="edit" transform="translate(0 -0.014)"> <path id="Контур_12675" data-name="Контур 12675" d="M11.083,7.013A.583.583,0,0,0,10.5,7.6v4.667a.584.584,0,0,1-.583.583H1.75a.584.584,0,0,1-.583-.583V4.1a.584.584,0,0,1,.583-.583H6.417a.583.583,0,0,0,0-1.167H1.75A1.752,1.752,0,0,0,0,4.1v8.167a1.752,1.752,0,0,0,1.75,1.75H9.917a1.752,1.752,0,0,0,1.75-1.75V7.6A.583.583,0,0,0,11.083,7.013Zm0,0" fill="#fcfcfc"></path> <path id="Контур_12676" data-name="Контур 12676" d="M5.469,6.482a.3.3,0,0,0-.08.149L4.977,8.693a.291.291,0,0,0,.286.349.277.277,0,0,0,.057-.006l2.062-.412a.29.29,0,0,0,.149-.08l4.615-4.615L10.085,1.867Zm0,0" fill="#fcfcfc"></path> <path id="Контур_12677" data-name="Контур 12677" d="M13.573.44a1.459,1.459,0,0,0-2.062,0l-.807.807L12.766,3.31l.807-.807a1.458,1.458,0,0,0,0-2.062Zm0,0" fill="#fcfcfc"></path> </g> </svg> 
                                Редактировать
                            </button>
                            <button on:click={() => setModal("prolong")} class="adv__button prolong default">
                                <svg xmlns="http://www.w3.org/2000/svg" width="1.2962962962962963vh" height="1.1666666666666665vh" viewBox="0 0 14 12.6"> <g id="clock" transform="translate(0 -0.7)"> <g id="Сгруппировать_3593" data-name="Сгруппировать 3593"> <g id="Сгруппировать_3592" data-name="Сгруппировать 3592"> <path id="Контур_12678" data-name="Контур 12678" d="M8.4,6.3H7V4.2a.753.753,0,0,0-.7-.7.7.7,0,0,0-.7.7V7a.7.7,0,0,0,.7.7H8.4A.753.753,0,0,0,9.1,7,.753.753,0,0,0,8.4,6.3Z" fill="#101010"></path> </g> </g> <g id="Сгруппировать_3595" data-name="Сгруппировать 3595"> <g id="Сгруппировать_3594" data-name="Сгруппировать 3594"> <path id="Контур_12679" data-name="Контур 12679" d="M12.6,7a6.3,6.3,0,1,0-6.3,6.3V11.9A4.9,4.9,0,1,1,11.2,7H9.8l2.1,2.8L14,7Z" fill="#101010"></path> </g> </g> </g> </svg>
                                <div>Продлить время</div>
                                <div class="highlighted">Активно: </div>
                                <div class="endTime">{ convertSecondsToString(calculateDateDifference(data.endDate, $serverTime, true)) }</div>
                            </button>
                            <button on:click={() => setModal('remove')} class="adv__button remove">
                                <svg xmlns="http://www.w3.org/2000/svg" width="1.0127777777777778vh" height="1.2962962962962963vh" viewBox="0 0 10.938 14"> <path id="garbage" d="M12.211,4.156H3.538c-.009.107-.041-.463.587,8.957A.953.953,0,0,0,5.073,14h5.6a.953.953,0,0,0,.948-.887C12.253,3.685,12.22,4.261,12.211,4.156ZM6.163,12.248a.438.438,0,0,1-.474-.4L5.252,6.819a.438.438,0,0,1,.872-.076l.438,5.031A.437.437,0,0,1,6.163,12.248Zm2.149-.436a.437.437,0,1,1-.875,0V6.781a.437.437,0,1,1,.875,0ZM10.5,6.819l-.437,5.031a.438.438,0,0,1-.872-.076l.438-5.031a.438.438,0,1,1,.872.076Zm1.9-5.288H10.278c0-.058,0-.015,0-.581A.951.951,0,0,0,9.331,0H6.419a.951.951,0,0,0-.95.95c0,.556,0,.523,0,.581H3.356a.951.951,0,0,0-.95.95c0,.782,0,.745,0,.8H13.341c0-.056,0-.023,0-.8a.951.951,0,0,0-.95-.95ZM9.406,1.456a.075.075,0,0,1-.075.075H6.419a.075.075,0,0,1-.075-.075V.95A.075.075,0,0,1,6.419.875H9.331A.075.075,0,0,1,9.406.95Z" transform="translate(-2.406)" fill="#fcfcfc"></path> </svg> 
                                Удалить объявление
                            </button>
                        {/if}
                    </div>
                </div>
            </div>
        </div>
    {/if}
{/if}