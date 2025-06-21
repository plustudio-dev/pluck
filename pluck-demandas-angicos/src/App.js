import React, { useState, useEffect } from 'react';
import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously, signInWithCustomToken, onAuthStateChanged } from 'firebase/auth';
import { getFirestore, collection, addDoc, onSnapshot, query, deleteDoc, doc, Timestamp } from 'firebase/firestore';
import { PlusCircle, Download, Trash2, Loader2, Calendar, LayoutList, ScrollText, CheckCircle, Clock, MapPin, Tag, Lightbulb } from 'lucide-react';

// Certifique-se de que a biblioteca XLSX esteja disponível. No ambiente Canvas,
// podemos assumir que ela será carregada via CDN no HTML principal.
// Se não estiver, você precisaria adicioná-la com um script tag no index.html.
// Ex: <script src="https://unpkg.com/xlsx/dist/xlsx.full.min.js"></script>

function App() {
  // Variáveis globais do ambiente Canvas
  const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';
  const firebaseConfig = typeof __firebase_config !== 'undefined' ? JSON.parse(__firebase_config) : {};
  const initialAuthToken = typeof __initial_auth_token !== 'undefined' ? __initial_auth_token : null;

  // Estados da aplicação
  const [db, setDb] = useState(null);
  const [auth, setAuth] = useState(null);
  const [userId, setUserId] = useState(null);
  const [demands, setDemands] = useState([]);
  const [loading, setLoading] = useState(true);
  const [authReady, setAuthReady] = useState(false);
  const [form, setForm] = useState({
    demanda: '',
    tipoServico: '',
    prioridade: '',
    prazo: '',
    secretariaResponsavel: '',
    status: '',
    detalhes: '',
    observacoes: '',
    dataDemanda: ''
  });
  const [message, setMessage] = useState('');

  // 1. Inicialização do Firebase e Autenticação
  useEffect(() => {
    try {
      // Inicializa o Firebase App
      const app = initializeApp(firebaseConfig);
      const firestoreDb = getFirestore(app);
      const firebaseAuth = getAuth(app);

      setDb(firestoreDb);
      setAuth(firebaseAuth);

      // Listener para o estado de autenticação
      const unsubscribe = onAuthStateChanged(firebaseAuth, async (user) => {
        if (user) {
          // Usuário autenticado (ou anônimo)
          setUserId(user.uid);
          setAuthReady(true);
        } else {
          // Tenta autenticar com o token personalizado ou anonimamente
          try {
            if (initialAuthToken) {
              await signInWithCustomToken(firebaseAuth, initialAuthToken);
            } else {
              await signInAnonymously(firebaseAuth);
            }
          } catch (error) {
            console.error("Erro ao autenticar Firebase:", error);
            setMessage("Erro ao conectar com o serviço de autenticação.");
          }
        }
        setLoading(false); // Autenticação concluída
      });

      // Cleanup do listener ao desmontar o componente
      return () => unsubscribe();
    } catch (error) {
      console.error("Erro na inicialização do Firebase:", error);
      setMessage("Erro ao inicializar o Firebase. Verifique a configuração.");
      setLoading(false);
    }
  }, []);

  // 2. Carregar Demandas do Firestore em tempo real
  useEffect(() => {
    if (db && userId && authReady) {
      const demandsCollectionRef = collection(db, `artifacts/${appId}/users/${userId}/demands`);
      // Não usando orderBy para evitar problemas de índice no Firestore.
      // A ordenação será feita em memória.
      const q = query(demandsCollectionRef);

      const unsubscribe = onSnapshot(q, (snapshot) => {
        const demandsData = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data(),
          // Converte Timestamp para string para exibição
          createdAt: doc.data().createdAt ? doc.data().createdAt.toDate().toLocaleString() : 'N/A',
          dataDemanda: doc.data().dataDemanda ? doc.data().dataDemanda.toDate().toLocaleDateString('pt-BR') : 'N/A'
        }));
        // Opcional: Ordenar as demandas em memória pela data de criação
        demandsData.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
        setDemands(demandsData);
        setMessage(''); // Limpa mensagens de erro anteriores, se houver
      }, (error) => {
        console.error("Erro ao carregar demandas:", error);
        setMessage("Erro ao carregar demandas. Por favor, recarregue a página.");
      });

      return () => unsubscribe();
    }
  }, [db, userId, authReady, appId]);

  // Lida com a mudança de input no formulário
  const handleChange = (e) => {
    setForm({ ...form, [e.target.name]: e.target.value });
  };

  // Adiciona uma nova demanda ao Firestore
  const addDemand = async (e) => {
    e.preventDefault();
    if (!db || !userId) {
      setMessage("Serviço de banco de dados não disponível. Tente novamente.");
      return;
    }
    if (!form.demanda || !form.dataDemanda || !form.secretariaResponsavel) {
      setMessage("Por favor, preencha a Demanda, Data da Demanda e Secretaria Responsável.");
      return;
    }

    try {
      // Converte a string de data para um objeto Date e depois para Timestamp
      const [day, month, year] = form.dataDemanda.split('/');
      const dateObject = new Date(`${year}-${month}-${day}`);
      if (isNaN(dateObject.getTime())) {
        setMessage("Formato de data inválido. Use DD/MM/AAAA.");
        return;
      }

      const newDemand = {
        ...form,
        dataDemanda: Timestamp.fromDate(dateObject), // Armazena como Timestamp do Firebase
        createdAt: Timestamp.now() // Adiciona um timestamp de criação
      };
      await addDoc(collection(db, `artifacts/${appId}/users/${userId}/demands`), newDemand);
      setForm({
        demanda: '',
        tipoServico: '',
        prioridade: '',
        prazo: '',
        secretariaResponsavel: '',
        status: '',
        detalhes: '',
        observacoes: '',
        dataDemanda: ''
      });
      setMessage("Demanda adicionada com sucesso!");
    } catch (error) {
      console.error("Erro ao adicionar demanda:", error);
      setMessage("Erro ao adicionar demanda. Por favor, tente novamente.");
    }
  };

  // Exclui uma demanda do Firestore
  const deleteDemand = async (id) => {
    if (!db || !userId) {
      setMessage("Serviço de banco de dados não disponível. Tente novamente.");
      return;
    }
    // Cria um modal de confirmação simples
    const confirmed = window.confirm("Tem certeza que deseja excluir esta demanda?");
    if (!confirmed) {
      return;
    }

    try {
      await deleteDoc(doc(db, `artifacts/${appId}/users/${userId}/demands`, id));
      setMessage("Demanda excluída com sucesso!");
    } catch (error) {
      console.error("Erro ao excluir demanda:", error);
      setMessage("Erro ao excluir demanda. Por favor, tente novamente.");
    }
  };

  // Exporta as demandas para um arquivo Excel
  const exportToExcel = () => {
    if (demands.length === 0) {
      setMessage("Não há dados para exportar.");
      return;
    }

    try {
      // Prepara os dados para o SheetJS, mapeando para o formato da CSV de exemplo
      const dataToExport = demands.map(demand => ({
        'DEMANDA': demand.demanda || '',
        'TIPO DE SERVIÇO': demand.tipoServico || '',
        'PRIORIDADE': demand.prioridade || '',
        'PRAZO': demand.prazo || '',
        'SECRETARIA RESPONSÁVEL': demand.secretariaResponsavel || '',
        'STATUS': demand.status || '',
        'DETALHES': demand.detalhes || '',
        'OBSERVAÇÕES': demand.observacoes || '',
        'DATA DA DEMANDA': demand.dataDemanda || ''
      }));

      const worksheet = XLSX.utils.json_to_sheet(dataToExport);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, "Demandas");

      // Gera o arquivo Excel e o força download
      XLSX.writeFile(workbook, "Demandas_Angicos.xlsx");
      setMessage("Dados exportados para Excel com sucesso!");
    } catch (error) {
      console.error("Erro ao exportar para Excel:", error);
      setMessage("Erro ao exportar para Excel. Verifique se a biblioteca XLSX foi carregada.");
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-gray-100 dark:bg-gray-900 text-gray-800 dark:text-gray-200">
        <Loader2 className="animate-spin h-10 w-10 text-blue-500" />
        <p className="ml-3 text-lg">Carregando aplicação...</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 dark:from-gray-900 dark:to-gray-800 text-gray-800 dark:text-gray-200 p-6 font-inter">
      {/* Container Principal */}
      <div className="max-w-6xl mx-auto bg-white dark:bg-gray-850 rounded-2xl shadow-xl overflow-hidden">

        {/* Cabeçalho */}
        <header className="bg-blue-600 dark:bg-blue-700 text-white p-6 rounded-t-2xl">
          <h1 className="text-3xl font-bold text-center flex items-center justify-center gap-3">
            <LayoutList size={32} />
            Gerenciamento de Demandas da Prefeitura de Angicos
          </h1>
          {userId && (
            <p className="text-center text-sm mt-2 opacity-80">
              Usuário ID: <span className="font-mono">{userId}</span>
            </p>
          )}
        </header>

        {/* Área de Mensagens */}
        {message && (
          <div className="p-4 bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 rounded-b-lg text-center font-medium">
            {message}
          </div>
        )}

        <main className="p-6 grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Formulário de Adição de Demanda */}
          <div className="lg:col-span-1 bg-gray-50 dark:bg-gray-800 p-6 rounded-xl shadow-lg">
            <h2 className="text-2xl font-semibold mb-6 text-gray-900 dark:text-white flex items-center gap-2">
              <PlusCircle size={24} /> Adicionar Nova Demanda
            </h2>
            <form onSubmit={addDemand} className="space-y-4">
              {/* Campo: Demanda */}
              <div>
                <label htmlFor="demanda" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Demanda (Obrigatório)</label>
                <input
                  type="text"
                  id="demanda"
                  name="demanda"
                  value={form.demanda}
                  onChange={handleChange}
                  placeholder="Descreva a demanda"
                  className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-lg shadow-sm focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white transition-colors duration-200"
                  required
                />
              </div>
              {/* Campo: Tipo de Serviço */}
              <div>
                <label htmlFor="tipoServico" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Tipo de Serviço</label>
                <input
                  type="text"
                  id="tipoServico"
                  name="tipoServico"
                  value={form.tipoServico}
                  onChange={handleChange}
                  placeholder="Ex: Infraestrutura, Saúde"
                  className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-lg shadow-sm focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white transition-colors duration-200"
                />
              </div>
              {/* Campo: Prioridade */}
              <div>
                <label htmlFor="prioridade" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Prioridade</label>
                <select
                  id="prioridade"
                  name="prioridade"
                  value={form.prioridade}
                  onChange={handleChange}
                  className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-lg shadow-sm focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white appearance-none pr-8 transition-colors duration-200"
                >
                  <option value="">Selecione</option>
                  <option value="Alta">Alta</option>
                  <option value="Média">Média</option>
                  <option value="Baixa">Baixa</option>
                </select>
              </div>
              {/* Campo: Prazo */}
              <div>
                <label htmlFor="prazo" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Prazo</label>
                <input
                  type="text"
                  id="prazo"
                  name="prazo"
                  value={form.prazo}
                  onChange={handleChange}
                  placeholder="Ex: 1 semana, 1 mês"
                  className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-lg shadow-sm focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white transition-colors duration-200"
                />
              </div>
              {/* Campo: Secretaria Responsável */}
              <div>
                <label htmlFor="secretariaResponsavel" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Secretaria Responsável (Obrigatório)</label>
                <input
                  type="text"
                  id="secretariaResponsavel"
                  name="secretariaResponsavel"
                  value={form.secretariaResponsavel}
                  onChange={handleChange}
                  placeholder="Ex: Obras, Educação"
                  className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-lg shadow-sm focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white transition-colors duration-200"
                  required
                />
              </div>
              {/* Campo: Status */}
              <div>
                <label htmlFor="status" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Status</label>
                <select
                  id="status"
                  name="status"
                  value={form.status}
                  onChange={handleChange}
                  className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-lg shadow-sm focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white appearance-none pr-8 transition-colors duration-200"
                >
                  <option value="">Selecione</option>
                  <option value="Pendente">Pendente</option>
                  <option value="Em Andamento">Em Andamento</option>
                  <option value="Concluído">Concluído</option>
                  <option value="Cancelado">Cancelado</option>
                </select>
              </div>
              {/* Campo: Detalhes */}
              <div>
                <label htmlFor="detalhes" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Detalhes</label>
                <textarea
                  id="detalhes"
                  name="detalhes"
                  value={form.detalhes}
                  onChange={handleChange}
                  placeholder="Detalhes adicionais da demanda"
                  rows="3"
                  className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-lg shadow-sm focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white transition-colors duration-200"
                ></textarea>
              </div>
              {/* Campo: Observações */}
              <div>
                <label htmlFor="observacoes" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Observações</label>
                <textarea
                  id="observacoes"
                  name="observacoes"
                  value={form.observacoes}
                  onChange={handleChange}
                  placeholder="Observações importantes"
                  rows="3"
                  className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-lg shadow-sm focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white transition-colors duration-200"
                ></textarea>
              </div>
              {/* Campo: Data da Demanda */}
              <div>
                <label htmlFor="dataDemanda" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">Data da Demanda (DD/MM/AAAA)</label>
                <input
                  type="text"
                  id="dataDemanda"
                  name="dataDemanda"
                  value={form.dataDemanda}
                  onChange={handleChange}
                  placeholder="Ex: 21/06/2025"
                  className="w-full p-3 border border-gray-300 dark:border-gray-600 rounded-lg shadow-sm focus:ring-blue-500 focus:border-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white transition-colors duration-200"
                  required
                />
              </div>

              {/* Botão de Envio */}
              <button
                type="submit"
                className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold py-3 px-6 rounded-lg shadow-md transition-all duration-300 ease-in-out transform hover:scale-105 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 flex items-center justify-center gap-2"
              >
                <PlusCircle size={20} /> Adicionar Demanda
              </button>
            </form>
          </div>

          {/* Lista de Demandas */}
          <div className="lg:col-span-2 bg-gray-50 dark:bg-gray-800 p-6 rounded-xl shadow-lg">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-2xl font-semibold text-gray-900 dark:text-white flex items-center gap-2">
                <ScrollText size={24} /> Demandas Cadastradas
              </h2>
              <button
                onClick={exportToExcel}
                className="bg-green-600 hover:bg-green-700 text-white font-bold py-2 px-4 rounded-lg shadow-md transition-all duration-300 ease-in-out transform hover:scale-105 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2 flex items-center gap-2"
              >
                <Download size={20} /> Exportar para Excel
              </button>
            </div>

            {demands.length === 0 ? (
              <p className="text-center text-gray-600 dark:text-gray-400 py-8">Nenhuma demanda cadastrada ainda.</p>
            ) : (
              <div className="overflow-x-auto rounded-lg shadow-inner border border-gray-200 dark:border-gray-700">
                <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                  <thead className="bg-gray-100 dark:bg-gray-700">
                    <tr>
                      <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Demanda</th>
                      <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Tipo Serviço</th>
                      <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Prioridade</th>
                      <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Prazo</th>
                      <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Secretaria</th>
                      <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Status</th>
                      <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Data</th>
                      <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Ações</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                    {demands.map((demand) => (
                      <tr key={demand.id} className="hover:bg-gray-50 dark:hover:bg-gray-750 transition-colors duration-150">
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-gray-100 font-medium">{demand.demanda}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700 dark:text-gray-300">{demand.tipoServico}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700 dark:text-gray-300">
                          <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                            demand.prioridade === 'Alta' ? 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300' :
                            demand.prioridade === 'Média' ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-300' :
                            'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300'
                          }`}>
                            {demand.prioridade}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700 dark:text-gray-300">{demand.prazo}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700 dark:text-gray-300">{demand.secretariaResponsavel}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700 dark:text-gray-300">
                          <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${
                            demand.status === 'Concluído' ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300' :
                            demand.status === 'Em Andamento' ? 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-300' :
                            demand.status === 'Pendente' ? 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300' :
                            'bg-gray-100 text-gray-800 dark:bg-gray-900 dark:text-gray-300'
                          }`}>
                            {demand.status}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700 dark:text-gray-300 flex items-center gap-1">
                          <Calendar size={14} className="text-gray-500" /> {demand.dataDemanda}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                          <button
                            onClick={() => deleteDemand(demand.id)}
                            className="text-red-600 hover:text-red-900 dark:text-red-400 dark:hover:text-red-200 transition-colors duration-200 p-2 rounded-full hover:bg-red-100 dark:hover:bg-red-900"
                            title="Excluir Demanda"
                          >
                            <Trash2 size={20} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </main>
        {/* Rodapé */}
        <footer className="bg-gray-100 dark:bg-gray-800 p-4 text-center text-gray-600 dark:text-gray-400 text-sm rounded-b-2xl">
          <p>&copy; {new Date().getFullYear()} Pluck Studio. Todos os direitos reservados.</p>
        </footer>
      </div>
    </div>
  );
}

export default App;
